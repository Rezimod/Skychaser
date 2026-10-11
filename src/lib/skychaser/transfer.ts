/**
 * The transfer a Skychaser payment request asks for, built in the browser.
 * Safe to import client-side.
 */

import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { parseURL, type TransferRequestURL } from '@solana/pay';
import BigNumber from 'bignumber.js';
import { Buffer } from 'buffer';

const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/**
 * The memo, then SOL to the recipient carrying the order's reference key:
 * the same instructions, in the same order, as @solana/pay's createTransfer
 * builds for a native SOL request. Built here because createTransfer refuses
 * to pay an address that holds no SOL yet, which a new merchant wallet is.
 */
export function buildTransfer(url: string, sender: PublicKey, blockhash: string): { tx: Transaction; lamports: bigint } {
  const req = parseURL(url) as TransferRequestURL;
  if (!req.amount || !req.reference?.length) throw new Error('This payment request is incomplete.');
  if (req.splToken) throw new Error('Only SOL payments are taken.');
  const lamports = BigInt(req.amount.times(LAMPORTS_PER_SOL).integerValue(BigNumber.ROUND_FLOOR).toFixed(0));
  const transfer = SystemProgram.transfer({ fromPubkey: sender, toPubkey: req.recipient, lamports });
  for (const reference of req.reference) transfer.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
  const tx = new Transaction({ feePayer: sender, recentBlockhash: blockhash });
  if (req.memo) tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(req.memo, 'utf8') }));
  tx.add(transfer);
  return { tx, lamports };
}
