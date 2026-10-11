// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import { createTransfer, parseURL, type TransferRequestURL } from '@solana/pay';
import { paymentUrl } from '@/lib/skychaser/orders';
import { buildTransfer } from '@/lib/skychaser/transfer';

const merchant = new PublicKey('31Wuzk8J27KmZWHrufSs5R2yAet42GdLhb3DnYFLr2De');
const sender = Keypair.generate().publicKey;
const reference = Keypair.generate().publicKey.toBase58();
const orderId = '00000000-0000-4000-8000-0000000000aa';
const BLOCKHASH = '11111111111111111111111111111111';

describe('the payment transfer', () => {
  it('is instruction for instruction what Solana Pay builds, without needing the merchant account to exist', async () => {
    const url = paymentUrl({ recipient: merchant, amountSol: 0.031234, reference, label: 'Capsule 1', orderId });
    const ours = buildTransfer(url, sender, BLOCKHASH);

    // Solana Pay's own builder, against a chain where both accounts exist.
    const req = parseURL(url) as TransferRequestURL;
    const connection = {
      getAccountInfo: async () => ({ owner: new PublicKey('11111111111111111111111111111111'), executable: false, lamports: 1e9, data: Buffer.alloc(0) }),
      getLatestBlockhash: async () => ({ blockhash: BLOCKHASH, lastValidBlockHeight: 1 }),
    };
    const theirs = await createTransfer(connection as never, sender, { recipient: req.recipient, amount: req.amount!, reference: req.reference, memo: req.memo });

    const shape = (tx: typeof ours.tx) => tx.instructions.map((i) => ({
      program: i.programId.toBase58(),
      keys: i.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]),
      data: Buffer.from(i.data).toString('hex'),
    }));
    expect(shape(ours.tx)).toEqual(shape(theirs));
    expect(ours.lamports).toBe(BigInt(31_234_000));
    // The memo is the order id; the reference rides on the transfer, read-only.
    expect(Buffer.from(ours.tx.instructions[0].data).toString('utf8')).toBe(orderId);
    expect(ours.tx.instructions[1].keys.at(-1)).toEqual({ pubkey: new PublicKey(reference), isSigner: false, isWritable: false });
  });

  it('pays exactly the lamports the server will look for', () => {
    // The server ceils the quote to lamports; the browser floors it. Six decimals make them the same integer.
    for (const amountSol of [0.000001, 0.123456, 1.5, 0.033333]) {
      const url = paymentUrl({ recipient: merchant, amountSol, reference, label: 'x', orderId });
      expect(buildTransfer(url, sender, BLOCKHASH).lamports).toBe(BigInt(Math.round(amountSol * 1e9)));
    }
  });
});
