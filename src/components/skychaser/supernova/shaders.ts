/**
 * The supernova's shaders. BAKE draws a tileable noise texture once; SCENE
 * draws the star, the blast and the nebula; DOWN and BLUR make a soft quarter
 * size copy; FX lays bloom, depth of field and the grade over the scene.
 */

export const BAKE = `precision highp float;
uniform vec2 uRes;
// Tileable gradient noise, baked once: R soft gas, G ridged filaments, B fine detail, A broad shapes.
float hp(vec2 i,float P,float s){i=mod(i,P);return fract(sin(dot(i,vec2(127.1,311.7))+s*17.31)*43758.5453);}
vec2 gr(vec2 i,float P,float s){float h=hp(i,P,s)*6.2831853;return vec2(cos(h),sin(h));}
float gn(vec2 p,float P,float s){vec2 i=floor(p),f=fract(p);vec2 u=f*f*f*(f*(f*6.-15.)+10.);
  float a=dot(gr(i,P,s),f),b=dot(gr(i+vec2(1,0),P,s),f-vec2(1,0)),c=dot(gr(i+vec2(0,1),P,s),f-vec2(0,1)),d=dot(gr(i+vec2(1,1),P,s),f-vec2(1,1));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
float fbm(vec2 uv,float P,int oct,float s){float a=.5,t=0.,n=0.;for(int i=0;i<8;i++){if(i>=oct)break;t+=a*gn(uv*P,P,s+float(i));n+=a;a*=.5;P*=2.;}return t/n*1.4+.5;}
float ridged(vec2 uv,float P,int oct,float s){float a=.5,t=0.,n=0.,w=1.;for(int i=0;i<8;i++){if(i>=oct)break;float v=1.-abs(gn(uv*P,P,s+float(i))*1.6);v=clamp(v,0.,1.);v*=v;v*=w;w=clamp(v*1.5,0.,1.);t+=a*v;n+=a;a*=.5;P*=2.;}return t/n;}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  vec2 o=vec2(fbm(uv,4.,4,61.),fbm(uv,4.,4,67.))-.5;
  vec2 o2=vec2(fbm(uv,8.,4,71.),fbm(uv,8.,4,79.))-.5;
  float r=fbm(uv+o*.18,5.,7,1.), g=ridged(uv+o*.14+o2*.04,4.,7,9.), b=fbm(uv+o2*.06,12.,6,23.), a=fbm(uv+o*.1,3.,5,41.);
  gl_FragColor=vec4(clamp(r,0.,1.),clamp(g*1.25,0.,1.),clamp(b,0.,1.),clamp(a,0.,1.));
}
`;

export const SCENE = `precision highp float;
uniform sampler2D uN;
uniform vec2 uRes, uC, uPan; uniform float uTime, uSeed, uZoom, uStarDim;
uniform float uStarR, uHeat, uStarI, uWob;
uniform vec4 uFA, uFI;
uniform float uIn, uInI, uFlash, uFlare;
uniform float uS1, uS1I, uS2, uS2I;
uniform float uE, uNebI, uNebHot, uTeal, uDeb, uDebI, uCore;
uniform vec3 uTint;
uniform sampler2D uPh, uRm;
uniform float uHasPh, uHasRm, uProm, uPromH, uRemI, uRemMix, uEmb;

float h11(float n){return fract(sin(n*127.1+uSeed)*43758.5453);}
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec4 N(vec2 p){return texture2D(uN,p);}
float h31(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm3(vec3 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*n3(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}

vec3 bb(float k){
  vec3 c=mix(vec3(.5,.05,.02),vec3(1.,.3,.06),smoothstep(0.,.3,k));
  c=mix(c,vec3(1.,.68,.3),smoothstep(.25,.6,k));
  c=mix(c,vec3(1.,.95,.86),smoothstep(.55,.85,k));
  return mix(c,vec3(.86,.93,1.),smoothstep(.88,1.,k));
}
vec3 stars(vec2 p){
  vec3 c=vec3(0.);
  for(int L=0;L<3;L++){
    float sc=L==0?70.:L==1?38.:20.;
    vec2 g=p*sc+float(L)*13.7; vec2 id=floor(g); vec2 f=fract(g)-.5;
    float h=h21(id+float(L)*17.);
    float th=L==2?.93:.86;
    if(h>th){
      vec2 o=vec2(h21(id+3.1),h21(id+7.7))-.5; float d=length(f-o*.6);
      float b=(h-th)/(1.-th); float tw=.65+.35*sin(uTime*(.8+h*3.)+h*50.);
      vec3 sc2=mix(vec3(1.,.82,.62),vec3(.9,.94,1.),h21(id+9.));
      c+=sc2*smoothstep(.12*b+.05,0.,d)*b*b*tw*(L==2?1.3:.8);
    }
  }
  return c;
}
float streaks(float a,float r,float Nn,float head,float len,float w,float seed,float dir){
  float u=(a/6.2831853+.5)*Nn; float id=floor(u);
  float h=h11(id+seed), h2=h11(id*1.73+seed+3.);
  if(h2<.45) return 0.;
  float da=(fract(u)-(.2+.6*h))/Nn*6.2831853*r;
  float hp=head*(dir>0.?(.5+.5*h2):(1.+.6*h2)); float L=len*(.4+.6*h);
  float x=dir>0.?(r-(hp-L))/L:((hp+L)-r)/L;
  if(x<0.||x>1.) return 0.;
  return exp(-da*da/(w*w))*x*x*(.4+.6*h);
}
// Equirectangular coordinates on the sphere, pole along y.
vec2 eq(vec3 v){return vec2(atan(v.x,v.z)/6.2831853+.5,acos(clamp(v.y,-1.,1.))/3.14159265);}
float adiff(float a,float b){return mod(a-b+3.14159265,6.2831853)-3.14159265;}
float flare(float a,float r,float R,float fa,float fi){
  if(fi<.001) return 0.;
  float o=(r-R)/R;
  if(o<-.05) return 0.;
  float reach=.3+1.15*fi;
  // The plume curls as it climbs, frays into strands, and throws a knot of plasma ahead of it.
  float d=adiff(a,fa)-o*.32*sin(fa*3.1+1.3);
  float wob=N(vec2(o*.4-uTime*.12,fa*.2)).r-.5;
  float w=.05+.2*o;
  float core=exp(-pow((d+wob*.3)/w,2.));
  float strands=.3+1.4*pow(N(vec2(d*9.+fa,o*1.4-uTime*.32)).g,2.);
  float knot=exp(-pow((o-reach*.6)/(.1+.08*fi),2.))*.7;
  return core*(exp(-max(o,0.)/reach*2.2)+knot)*strands*fi*(1.+1.4*N(vec2(d*1.5,o*.6-uTime*.2)).b);
}

// Prominences: arches of plasma standing on the limb, rising and settling slowly, turbulent and stranded.
float prom(float a,float r,float R){
  float o=(r-R)/R;
  if(o<-.03||o>.75*uPromH) return 0.;
  float s=0.;
  for(int i=0;i<6;i++){
    float fi=float(i);
    float site=h11(fi*3.7+1.)*6.2831853-3.14159265;
    float life=.5+.5*sin(uTime*(.06+.05*h11(fi+9.))+fi*2.1);
    float H=(.1+.32*h11(fi+5.))*uPromH*(.5+.5*life);
    float w=.08+.15*h11(fi+2.);
    float x=adiff(a,site)*r/R;
    if(abs(x)>w*2.2) continue;
    vec4 nn=N(vec2(x*1.3+fi*.17,o*1.1-uTime*.02*(1.+fi*.1)));
    vec2 q=vec2(x/w,o/H)+(nn.ra-.5)*.4;
    float e=length(q);
    // A thick, fraying arch of plasma with a faint glow filling the space under it.
    float tube=exp(-pow((e-1.)/(.24+.14*nn.b),2.));
    float fill=exp(-e*e*1.4)*.32*smoothstep(0.,.25,q.y);
    float strands=.25+1.2*pow(N(vec2(atan(q.y,q.x)*3.+fi,e*7.-uTime*.03)).g,2.)*(.6+.8*N(vec2(x*6.+fi,o*9.)).b);
    s+=(tube+fill)*strands*(.35+.65*life)*smoothstep(-.03,.03,o)*.75;
  }
  return s;
}

// The remnant: soft gas lit from the core, ridged filaments on the shell, dark dust across it, oxygen-teal deep inside.
vec3 nebula(vec2 p,float r,vec2 dir){
  vec2 q=p/uE; float qr=length(q);
  if(qr>1.9) return vec3(0.);
  vec2 s=q*.42+vec2(uSeed*.0131,uSeed*.0293);
  float t=uTime*.0035;
  vec4 w=N(s*.6+vec2(t,-t));
  vec2 warp=(w.ra-.5)*.2;
  vec4 n=N(s+warp);
  vec4 n2=N(mat2(.8,-.6,.6,.8)*s*2.1+warp*1.7+.37);
  vec4 n3=N(mat2(.28,.96,-.96,.28)*s*4.3+warp*2.4+.71);
  float edge=.84+.36*(N(dir*.16+vec2(.31,.63)+uSeed*.01).a-.5)+.16*(N(dir*.45+.12+uSeed*.007).b-.5);
  float e=qr/edge;
  float body=smoothstep(1.06,.4,e);
  float shell=smoothstep(.42,.84,e)*smoothstep(1.1,.86,e);
  float gas=smoothstep(.34,.9,n.r)*.5*(.5+.8*n3.b);
  float fil=pow(n2.g,4.)*2.7+pow(n3.g,5.)*1.6;
  vec3 hot=vec3(1.,.9,.76), gold=vec3(1.,.6,.2), crim=vec3(.82,.11,.06);
  vec3 gc=mix(hot,gold,smoothstep(0.,.42,e)); gc=mix(gc,crim,smoothstep(.42,1.,e)); gc=mix(gc,uTint,.22);
  vec3 c=gc*gas*body;
  c+=mix(vec3(1.,.62,.28),crim*1.2,smoothstep(.3,1.,e))*fil*(shell*1.5+body*.3);
  c+=hot*pow(n2.g,9.)*shell*1.6;
  c+=vec3(.1,.42,.5)*smoothstep(.6,.0,e)*pow(n2.r,1.4)*uTeal*1.3;
  float wisp=pow(N(s*.55-warp*.5+.2).g,3.)*smoothstep(1.85,.95,e)*smoothstep(.75,1.,e);
  c+=crim*wisp*.55;
  float illum=1.5/(1.+pow(qr*2.6,2.))+.2; c*=illum;
  float knots=smoothstep(.75,.95,n3.g*n2.g)*shell; c+=vec3(1.,.85,.6)*knots*1.2;
  float dust=smoothstep(.5,.8,N(s*1.35-warp*.9+.61).r)*smoothstep(1.15,.25,e);
  c=mix(c,c*vec3(.55,.72,.9),dust*.5); c*=1.-dust*.7;
  c=mix(c,hot*dot(c,vec3(.45))*1.6,uNebHot);
  // The photographed remnant over the drawn gas: the shock shell first, filling in to the nebula; it turns with the seed and breathes with the warp.
  if(uHasRm>.5&&uRemI>.001){
    float ra=uSeed*.37, ca=cos(ra), sa=sin(ra);
    vec2 rq=mat2(ca,-sa,sa,ca)*(q+warp*.5);
    vec2 uv=.5+rq*.44;
    vec3 rm=vec3(0.);
    if(abs(uv.x-.5)<.5&&abs(uv.y-.5)<.5){
      vec3 shell=texture2D(uRm,vec2(clamp(uv.x,.002,.998)*.5,uv.y)).rgb;
      vec2 cu=clamp(.5+(uv-.5)*1.1,.002,.998);
      vec3 crab=texture2D(uRm,vec2(.5+cu.x*.5,cu.y)).rgb;
      rm=mix(shell,crab,uRemMix);
    }
    rm=pow(rm,vec3(1.25))*2.4;
    rm=mix(rm,rm*(.6+uTint),.18);
    rm=mix(rm,hot*dot(rm,vec3(.42))*1.5,uNebHot*.85);
    c=c*(1.-.5*uRemI)+rm*uRemI*(.85+.35/(1.+qr*qr*4.));
  }
  return c;
}

void main(){
  vec2 p=(gl_FragCoord.xy-uC)/uRes.y/uZoom+uPan;
  float r=length(p); vec2 dir=p/max(r,1e-4); float a=atan(p.y,p.x);
  vec3 col=vec3(0.);

  float s1=exp(-pow((r-uS1)/.010,2.))*uS1I, s2=exp(-pow((r-uS2)/.008,2.))*uS2I;
  float lens=exp(-pow((r-uS1)/.06,2.))*uS1I*.7;
  vec2 pb=(p-uPan)*sqrt(uZoom)+uPan*.4-dir*(s1*.03+s2*.02+lens*.055);
  col+=stars(pb)*(1.-.9*clamp(uFlash,0.,1.))*uStarDim;

  if(uNebI>.001) col+=nebula(p,r,dir)*uNebI;

  if(uStarI>.001){
    float R=uStarR*(1.+uWob*(N(vec2(a*.4,uTime*.5)).r-.5));
    float px=1.6/uRes.y/uZoom, msk=smoothstep(R+px*.5,R-px,r);
    if(r<R+px){
      float q=min(r/R,1.); float mu=sqrt(1.-q*q); vec3 n=vec3(p/R,mu);
      float ct=cos(uTime*.06),st=sin(uTime*.06); n.xz=mat2(ct,-st,st,ct)*n.xz;
      float g1=fbm3(n*4.5+vec3(0.,0.,uTime*(.12+uWob*3.)));
      float g2=fbm3(n*13.-vec3(uTime*(.25+uWob*4.)));
      // The surface: a photographed granulation map wrapped on the sphere, two drifting layers so the cells boil.
      float ph=g1;
      if(uHasPh>.5){
        // Near the poles the map pinches; there a second wrapping, its pole on the equator, takes over.
        vec2 tuv=eq(n), tuv2=eq(n.yxz);
        float wp=smoothstep(.5,.82,abs(n.y));
        vec2 dA=vec2(uTime*.003,0.), dB=vec2(.37,.11)-vec2(uTime*.005,uTime*.0015);
        float tA=mix(texture2D(uPh,tuv+dA).r,texture2D(uPh,tuv2+dA).r,wp);
        float tB=mix(texture2D(uPh,tuv*1.7+dB).r,texture2D(uPh,tuv2*1.7+dB).r,wp);
        ph=mix(tA,tB,.38+.18*sin(uTime*.3))*.8+g1*.2+(g2-.5)*.2;
      }
      float k=uHeat+(ph-.5)*.5+(g2-.5)*.12-.16*(1.-mu);
      float ld=.32+.68*pow(max(mu,.02),.55);
      col+=bb(clamp(k,0.,1.))*(.35+1.25*ph)*ld*uStarI*(1.4+uHeat*2.6)*msk;
    }
    float o=max(r-R,0.)/max(R,1e-3);
    float cor=exp(-o*7.)*.8+exp(-o*2.)*.22+exp(-o*.6)*.05;
    cor*=.75+.5*N(dir*.3+vec2(uTime*.01,0.)).r;
    // Coronal streamers: faint rays reaching out from the limb.
    cor+=exp(-o*1.6)*.12*pow(N(vec2(a*1.6,uTime*.004)).g,3.)*smoothstep(0.,.05,o);
    float fl=flare(a,r,R,uFA.x,uFI.x)+flare(a,r,R,uFA.y,uFI.y)+flare(a,r,R,uFA.z,uFI.z)+flare(a,r,R,uFA.w,uFI.w);
    vec3 plasma=mix(vec3(1.,.36,.2),bb(clamp(uHeat+.2,0.,1.)),.45);
    col+=bb(clamp(uHeat+.08,0.,1.))*(cor+fl*.9)*uStarI*(1.-msk)*(1.+uHeat*2.5);
    // The chromosphere: a thin rose rim, bristling with spicules.
    float chrom=exp(-o*60.)*(.8+.4*N(vec2(a*6.,uTime*.05)).g);
    float spic=smoothstep(0.,.03,o)*exp(-o*16.)*pow(N(vec2(a*42.,o*3.-uTime*.03)).g,3.)*1.5;
    col+=plasma*(chrom*.85+spic)*uStarI*(1.-msk)*(1.+uHeat*1.5);
    if(uProm>.001&&r<R*(1.+.8*uPromH)) col+=plasma*prom(a,r,R)*uProm*uStarI*(1.-msk)*(1.1+uHeat*2.);
  }

  if(uInI>.001){
    float s=streaks(a,r,140.,uIn,.22,.0035,1.,-1.)+streaks(a,r,260.,uIn*1.2,.14,.0025,7.,-1.)*.7;
    col+=vec3(1.,.78,.5)*s*uInI*1.4;
  }
  if(uDebI>.001){
    float s=streaks(a,r,110.,uDeb,.18,.0034,11.,1.)+streaks(a,r,200.,uDeb*.8,.1,.0024,23.,1.)*.7;
    col+=mix(vec3(1.,.92,.8),uTint,.35)*s*uDebI*.85;
  }

  // Embers: sparks drifting out of the core around the card, in two layers.
  if(uEmb>.001){
    for(int L=0;L<2;L++){
      float fL=float(L), na=L==0?48.:84.;
      float rr=r*(14.+fL*10.)-uTime*(.22+.12*fL);
      vec2 g=vec2((a/6.2831853+.5)*na,rr);
      vec2 id=floor(g), f=fract(g)-.5;
      float h=h21(id+fL*31.);
      if(h>.86){
        vec2 o2=vec2(h21(id+5.3),h21(id+9.1))-.5;
        float d=length((f-o2*.5)*vec2(1.,1.6));
        float tw=.55+.45*sin(uTime*(2.+h*5.)+h*40.);
        col+=mix(vec3(1.,.62,.28),uTint,.3)*smoothstep(.14,0.,d)*(h-.86)/.14*tw*uEmb*smoothstep(.04,.14,r)*exp(-r*2.2)*(L==0?1.6:1.);
      }
    }
  }
  col+=vec3(1.,.93,.82)*uCore*(.0007/(r*r+.0007));
  col+=mix(vec3(1.,.75,.45),uTint,.5)*uCore*exp(-r*6.)*.4;
  col+=vec3(1.,.82,.58)*uFlare*(exp(-abs(p.y)*170.)*exp(-abs(p.x)*1.6)+.45*exp(-abs(p.x)*190.)*exp(-abs(p.y)*4.));
  col+=vec3(1.,.82,.58)*uFlare*.25*exp(-abs(p.y)*30.)*exp(-abs(p.x)*1.);
  col+=vec3(1.,.9,.74)*(s1*.95+s2*.7)+mix(vec3(1.,.7,.4),uTint,.5)*lens*.4;
  col+=vec3(1.,.96,.9)*uFlash*(.35+2.2*exp(-r*3.));

  col*=1.15; float Lm=dot(col,vec3(.2126,.7152,.0722)); vec3 tc=1.-exp(-col); vec3 tl=col*(1.-exp(-Lm))/max(Lm,1e-4);
  col=mix(tl,tc,smoothstep(.6,2.2,Lm)); col=pow(clamp(col,0.,1.),vec3(.95));
  gl_FragColor=vec4(col,1.);
}
`;

export const DOWN = `precision highp float;
uniform sampler2D uTex; uniform vec2 uTx;
void main(){vec2 uv=gl_FragCoord.xy*4.*uTx;
  vec3 c=texture2D(uTex,uv+uTx*vec2(-1.,-1.)).rgb+texture2D(uTex,uv+uTx*vec2(1.,-1.)).rgb+texture2D(uTex,uv+uTx*vec2(-1.,1.)).rgb+texture2D(uTex,uv+uTx*vec2(1.,1.)).rgb;
  gl_FragColor=vec4(c*.25,1.);}
`;

export const BLUR = `precision highp float;
uniform sampler2D uTex; uniform vec2 uTx, uDir;
void main(){vec2 uv=gl_FragCoord.xy*uTx;
  vec3 c=texture2D(uTex,uv).rgb*.2270;
  c+=(texture2D(uTex,uv+uDir*uTx*1.3846).rgb+texture2D(uTex,uv-uDir*uTx*1.3846).rgb)*.3162;
  c+=(texture2D(uTex,uv+uDir*uTx*3.2308).rgb+texture2D(uTex,uv-uDir*uTx*3.2308).rgb)*.0703;
  gl_FragColor=vec4(c,1.);}
`;

export const FX = `precision highp float;
uniform sampler2D uTex, uBl; uniform vec2 uRes; uniform vec2 uC; uniform float uBlur, uRays, uCA, uTime, uVig, uWhite, uBloom, uDof, uClear;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes, c=uC/uRes, d=uv-c;
  vec3 sharp;
  sharp.r=texture2D(uTex,c+d*(1.+uCA)).r; sharp.g=texture2D(uTex,uv).g; sharp.b=texture2D(uTex,c+d*(1.-uCA)).b;
  vec3 col=sharp;
  if(uBlur+uRays>.001){
    vec3 acc=vec3(0.); float ws=0.;
    float jit=h21(gl_FragCoord.xy+uTime)*.06;
    for(int i=0;i<18;i++){
      float f=(float(i)+jit)/17.; float s=1.-(.07+.4*uBlur)*f; float w=1.-f*.8;
      acc+=texture2D(uTex,c+d*s).rgb*w; ws+=w;
    }
    vec3 rb=acc/ws;
    col=mix(sharp,rb,clamp(uBlur,0.,1.))+max(rb-.42,0.)*uRays*1.3;
  }
  vec3 bl=texture2D(uBl,uv).rgb;
  // depth of field: once the card is here, the nebula falls soft and quiet behind it
  col=mix(col,bl*.62,uDof);
  // bloom: highlights breathe light into their surroundings
  col+=max(bl-.3,0.)*uBloom*1.25+bl*uBloom*.1;
  // grade: deep blacks, cool in the shadows, warm in the highlights, a gentle film curve
  float L=dot(col,vec3(.2126,.7152,.0722));
  col=mix(vec3(L),col,.9);
  col+=vec3(-.010,.004,.016)*(1.-smoothstep(0.,.3,L));
  col*=mix(vec3(1.),vec3(1.03,1.,.95),smoothstep(.5,1.,L));
  col=clamp(col,0.,1.); col=mix(col,col*col*(3.-2.*col),.35);
  col=mix(col,vec3(1.,.975,.93),uWhite);
  col*=1.-uVig*smoothstep(.2,1.05,length(d*vec2(1.,uRes.y/uRes.x*.75))*1.5);
  col+=(h21(gl_FragCoord.xy+fract(uTime*7.)*91.)-.5)*mix(.03,.012,L);
  // clear: the black falls away so the star lies straight on the page (premultiplied, light only adds)
  if(uClear>.5){ col=max(col-.035,0.); gl_FragColor=vec4(col,max(max(col.r,col.g),col.b)); return; }
  gl_FragColor=vec4(col,1.);
}
`;
