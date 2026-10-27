import numpy as np, subprocess, sys
S = __import__('os').environ.get('ADWORK', '.')
SR=48000
raw=subprocess.run(['ffmpeg','-v','error','-i',f'{S}/src/astroman-01_v5.mp4','-f','f32le','-ac','2','-ar',str(SR),'-'],capture_output=True,check=True).stdout
m=np.frombuffer(raw,np.float32).reshape(-1,2).copy()
A,B,X=12.90,41.02,0.03          # splice: new 12.90 == original 41.02 (both on a downbeat hit)
a=m[:int((A+X/2)*SR)]; b=m[int((B-X/2)*SR):]
n=int(X*SR); f=np.linspace(0,1,n)[:,None]
mus=np.concatenate([a[:-n], a[-n:]*(1-f)+b[:n]*f, b[n:]])
TOTAL=float(sys.argv[1]); mus=mus[:int(TOTAL*SR)]
out=np.zeros_like(mus); rng=np.random.default_rng(3)
def put(sig,t,g):
    i=int(t*SR); j=min(len(out),i+len(sig)); out[i:j]+=sig[:j-i]*g
def lp(x,a):  # one-pole lowpass
    y=np.empty_like(x); s=0.0
    av=np.broadcast_to(a,x.shape)
    for k in range(len(x)): s+=av[k]*(x[k]-s); y[k]=s
    return y
def boom(dur=1.2,f0=70,f1=32):
    t=np.arange(int(dur*SR))/SR; fr=f1+(f0-f1)*np.exp(-t*6); ph=2*np.pi*np.cumsum(fr)/SR
    s=np.sin(ph)*np.exp(-t*3.2); s=np.tanh(s*1.6)
    cl=rng.normal(0,1,len(t))*np.exp(-t*60)*0.5
    return np.stack([s+cl,s+cl],1)
def whoosh(dur=0.32):
    t=np.arange(int(dur*SR))/SR; env=np.sin(np.pi*t/dur)**2*(t/dur)
    nz=rng.normal(0,1,len(t)); nz=nz-lp(nz,0.08); nz=lp(nz,0.35)
    pan=t/dur
    return np.stack([nz*env*(1-pan*.5),nz*env*(.5+pan*.5)],1)
def riser(dur=1.5):
    t=np.arange(int(dur*SR))/SR; x=t/dur
    nz=rng.normal(0,1,len(t)); hp=nz-lp(nz,0.02+0.25*x); s=hp*(x**2.5)
    tone=np.sin(2*np.pi*np.cumsum(180+900*x**2)/SR)*x**3*0.25
    return np.stack([s+tone,s+tone],1)
put(boom(1.3),0.0,0.55)
for t in (4.14,5.02,5.90): put(whoosh(),t-0.26,0.18)
for t in (1.50,6.78,11.18): put(whoosh(0.28),t-0.22,0.12)
r=riser(1.45); put(r,12.90-len(r)/SR,0.22)
put(boom(1.6,85,30),12.90,0.8)
put(boom(1.2,60,30),16.46,0.5)
mix=mus+out
mix[:int(0.02*SR)]*=np.linspace(0,1,int(0.02*SR))[:,None]
fo=int(0.35*SR); mix[-fo:]*=np.linspace(1,0,fo)[:,None]
mix.astype(np.float32).tofile(f'{S}/build/mix.f32')
print('audio s', len(mix)/SR)
