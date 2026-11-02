import{r as y,j as g}from"./index-CqmzAdYU.js";import{h as P,V as v,i as C,j as B,U as G,k as z,b as p,_,B as k,l as E,m as I,n as j,o as U,u as O,P as D,a as R,M as F,Q as H,E as L,c as M,C as w,d as N,e as V}from"./Stars-C5X3X52d.js";const W=parseInt(P.replace(/\D+/g,""));var Z=Object.defineProperty,K=(t,r,o)=>r in t?Z(t,r,{enumerable:!0,configurable:!0,writable:!0,value:o}):t[r]=o,S=(t,r,o)=>(K(t,typeof r!="symbol"?r+"":r,o),o);const X=(()=>{const t={uniforms:{turbidity:{value:2},rayleigh:{value:1},mieCoefficient:{value:.005},mieDirectionalG:{value:.8},sunPosition:{value:new v},up:{value:new v(0,1,0)}},vertexShader:`
      uniform vec3 sunPosition;
      uniform float rayleigh;
      uniform float turbidity;
      uniform float mieCoefficient;
      uniform vec3 up;

      varying vec3 vWorldPosition;
      varying vec3 vSunDirection;
      varying float vSunfade;
      varying vec3 vBetaR;
      varying vec3 vBetaM;
      varying float vSunE;

      // constants for atmospheric scattering
      const float e = 2.71828182845904523536028747135266249775724709369995957;
      const float pi = 3.141592653589793238462643383279502884197169;

      // wavelength of used primaries, according to preetham
      const vec3 lambda = vec3( 680E-9, 550E-9, 450E-9 );
      // this pre-calcuation replaces older TotalRayleigh(vec3 lambda) function:
      // (8.0 * pow(pi, 3.0) * pow(pow(n, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * pn)) / (3.0 * N * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * pn))
      const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );

      // mie stuff
      // K coefficient for the primaries
      const float v = 4.0;
      const vec3 K = vec3( 0.686, 0.678, 0.666 );
      // MieConst = pi * pow( ( 2.0 * pi ) / lambda, vec3( v - 2.0 ) ) * K
      const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );

      // earth shadow hack
      // cutoffAngle = pi / 1.95;
      const float cutoffAngle = 1.6110731556870734;
      const float steepness = 1.5;
      const float EE = 1000.0;

      float sunIntensity( float zenithAngleCos ) {
        zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
        return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
      }

      vec3 totalMie( float T ) {
        float c = ( 0.2 * T ) * 10E-18;
        return 0.434 * c * MieConst;
      }

      void main() {

        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        vWorldPosition = worldPosition.xyz;

        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        gl_Position.z = gl_Position.w; // set z to camera.far

        vSunDirection = normalize( sunPosition );

        vSunE = sunIntensity( dot( vSunDirection, up ) );

        vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );

        float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );

      // extinction (absorbtion + out scattering)
      // rayleigh coefficients
        vBetaR = totalRayleigh * rayleighCoefficient;

      // mie coefficients
        vBetaM = totalMie( turbidity ) * mieCoefficient;

      }
    `,fragmentShader:`
      varying vec3 vWorldPosition;
      varying vec3 vSunDirection;
      varying float vSunfade;
      varying vec3 vBetaR;
      varying vec3 vBetaM;
      varying float vSunE;

      uniform float mieDirectionalG;
      uniform vec3 up;

      const vec3 cameraPos = vec3( 0.0, 0.0, 0.0 );

      // constants for atmospheric scattering
      const float pi = 3.141592653589793238462643383279502884197169;

      const float n = 1.0003; // refractive index of air
      const float N = 2.545E25; // number of molecules per unit volume for air at 288.15K and 1013mb (sea level -45 celsius)

      // optical length at zenith for molecules
      const float rayleighZenithLength = 8.4E3;
      const float mieZenithLength = 1.25E3;
      // 66 arc seconds -> degrees, and the cosine of that
      const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;

      // 3.0 / ( 16.0 * pi )
      const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
      // 1.0 / ( 4.0 * pi )
      const float ONE_OVER_FOURPI = 0.07957747154594767;

      float rayleighPhase( float cosTheta ) {
        return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
      }

      float hgPhase( float cosTheta, float g ) {
        float g2 = pow( g, 2.0 );
        float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
        return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
      }

      void main() {

        vec3 direction = normalize( vWorldPosition - cameraPos );

      // optical length
      // cutoff angle at 90 to avoid singularity in next formula.
        float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
        float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
        float sR = rayleighZenithLength * inverse;
        float sM = mieZenithLength * inverse;

      // combined extinction factor
        vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );

      // in scattering
        float cosTheta = dot( direction, vSunDirection );

        float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
        vec3 betaRTheta = vBetaR * rPhase;

        float mPhase = hgPhase( cosTheta, mieDirectionalG );
        vec3 betaMTheta = vBetaM * mPhase;

        vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
        Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );

      // nightsky
        float theta = acos( direction.y ); // elevation --> y-axis, [-pi/2, pi/2]
        float phi = atan( direction.z, direction.x ); // azimuth --> x-axis [-pi/2, pi/2]
        vec2 uv = vec2( phi, theta ) / vec2( 2.0 * pi, pi ) + vec2( 0.5, 0.0 );
        vec3 L0 = vec3( 0.1 ) * Fex;

      // composition + solar disc
        float sundisk = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
        L0 += ( vSunE * 19000.0 * Fex ) * sundisk;

        vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

        vec3 retColor = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );

        gl_FragColor = vec4( retColor, 1.0 );

      #include <tonemapping_fragment>
      #include <${W>=154?"colorspace_fragment":"encodings_fragment"}>

      }
    `},r=new C({name:"SkyShader",fragmentShader:t.fragmentShader,vertexShader:t.vertexShader,uniforms:G.clone(t.uniforms),side:B,depthWrite:!1});class o extends z{constructor(){super(new p(1,1,1),r)}}return S(o,"SkyShader",t),S(o,"material",r),o})();function Q(t,r,o=new v){const s=Math.PI*(t-.5),l=2*Math.PI*(r-.5);return o.x=Math.cos(l),o.y=Math.sin(s),o.z=Math.sin(l),o}const $=y.forwardRef(({inclination:t=.6,azimuth:r=.1,distance:o=1e3,mieCoefficient:s=.005,mieDirectionalG:l=.8,rayleigh:n=.5,turbidity:c=10,sunPosition:m=Q(t,r),...i},a)=>{const e=y.useMemo(()=>new v().setScalar(o),[o]),[u]=y.useState(()=>new X);return y.createElement("primitive",_({object:u,ref:a,"material-uniforms-mieCoefficient-value":s,"material-uniforms-mieDirectionalG-value":l,"material-uniforms-rayleigh-value":n,"material-uniforms-sunPosition-value":m,"material-uniforms-turbidity-value":c,scale:e},i))});function q(t,r=!1){const o=t[0].index!==null,s=new Set(Object.keys(t[0].attributes)),l=new Set(Object.keys(t[0].morphAttributes)),n={},c={},m=t[0].morphTargetsRelative,i=new k;let a=0;for(let e=0;e<t.length;++e){const u=t[e];let h=0;if(o!==(u.index!==null))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+e+". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them."),null;for(const f in u.attributes){if(!s.has(f))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+e+'. All geometries must have compatible attributes; make sure "'+f+'" attribute exists among all geometries, or in none of them.'),null;n[f]===void 0&&(n[f]=[]),n[f].push(u.attributes[f]),h++}if(h!==s.size)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+e+". Make sure all geometries have the same number of attributes."),null;if(m!==u.morphTargetsRelative)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+e+". .morphTargetsRelative must be consistent throughout all geometries."),null;for(const f in u.morphAttributes){if(!l.has(f))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+e+".  .morphAttributes must be consistent throughout all geometries."),null;c[f]===void 0&&(c[f]=[]),c[f].push(u.morphAttributes[f])}if(r){let f;if(o)f=u.index.count;else if(u.attributes.position!==void 0)f=u.attributes.position.count;else return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+e+". The geometry must have either an index or a position attribute"),null;i.addGroup(a,f,e),a+=f}}if(o){let e=0;const u=[];for(let h=0;h<t.length;++h){const f=t[h].index;for(let d=0;d<f.count;++d)u.push(f.getX(d)+e);e+=t[h].attributes.position.count}i.setIndex(u)}for(const e in n){const u=A(n[e]);if(!u)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+e+" attribute."),null;i.setAttribute(e,u)}for(const e in c){const u=c[e][0].length;if(u===0)break;i.morphAttributes=i.morphAttributes||{},i.morphAttributes[e]=[];for(let h=0;h<u;++h){const f=[];for(let b=0;b<c[e].length;++b)f.push(c[e][b][h]);const d=A(f);if(!d)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+e+" morphAttribute."),null;i.morphAttributes[e].push(d)}}return i}function A(t){let r,o,s,l=-1,n=0;for(let a=0;a<t.length;++a){const e=t[a];if(r===void 0&&(r=e.array.constructor),r!==e.array.constructor)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes."),null;if(o===void 0&&(o=e.itemSize),o!==e.itemSize)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes."),null;if(s===void 0&&(s=e.normalized),s!==e.normalized)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes."),null;if(l===-1&&(l=e.gpuType),l!==e.gpuType)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes."),null;n+=e.count*o}const c=new r(n),m=new E(c,o,s);let i=0;for(let a=0;a<t.length;++a){const e=t[a];if(e.isInterleavedBufferAttribute){const u=i/o;for(let h=0,f=e.count;h<f;h++)for(let d=0;d<o;d++){const b=e.getComponent(h,d);m.setComponent(h+u,d,b)}}else c.set(e.array,i);i+=e.count*o}return l!==void 0&&(m.gpuType=l),m}const ae=.1;function J({engine:t}){return O((r,o)=>{document.hidden||t.tick(o)},-1),null}function se({engine:t,theme:r,camera:o,target:s=[0,0,0],fog:l=[60,260],space:n=!1,autoRotate:c=!0,maxDistance:m=300,children:i}){const a=r==="dark"||n,e=n?"#03050b":a?"#0a1222":"#cfe0f2";return g.jsxs(I,{className:"sim-canvas",dpr:[1,1.75],camera:{position:o,fov:45,near:.3,far:3e3},gl:{antialias:!0},children:[g.jsx("color",{attach:"background",args:[e]}),!n&&g.jsx("fog",{attach:"fog",args:[e,l[0],l[1]]}),a?g.jsx(j,{radius:n?400:600,depth:n?200:60,count:n?6e3:2500,factor:n?5:4,fade:!0,speed:.5}):g.jsx($,{distance:4e3,sunPosition:[200,60,-300],turbidity:6,rayleigh:1.2,mieCoefficient:.004}),g.jsx("hemisphereLight",{args:a?["#b4c6ee","#3a4660",1.7]:["#ffffff","#7a8a6a",1.3]}),g.jsx("directionalLight",{position:a?[-80,120,60]:[120,160,-80],intensity:a?1.8:2.4,color:a?"#c8d4ff":"#fff4e0"}),g.jsx(J,{engine:t}),i,g.jsx(U,{target:s,autoRotate:c,autoRotateSpeed:.3,enableDamping:!0,maxPolarAngle:Math.PI*.48,minDistance:8,maxDistance:m,makeDefault:!0})]})}const T=new F,Y=new H,ee=new L,te=new v,oe=new v;function x(t){const r=t.map(([s,l,n={}])=>{const c=s.index?s.toNonIndexed():s.clone();for(const e of Object.keys(c.attributes))e!=="position"&&e!=="normal"&&c.deleteAttribute(e);T.compose(te.set(...n.p||[0,0,0]),Y.setFromEuler(ee.set(...n.r||[0,0,0])),oe.set(...n.s||[1,1,1])),c.applyMatrix4(T);const m=new R(l),i=c.attributes.position.count,a=new Float32Array(i*3);for(let e=0;e<i;e++)a[e*3]=m.r,a[e*3+1]=m.g,a[e*3+2]=m.b;return c.setAttribute("color",new E(a,3)),s.dispose(),c}),o=q(r);return o.computeVertexNormals(),o.computeBoundingSphere(),o}function le(t="rgba(255,255,255,1)",r="rgba(255,255,255,0)"){const o=document.createElement("canvas");o.width=o.height=64;const s=o.getContext("2d"),l=s.createRadialGradient(32,32,0,32,32,32);l.addColorStop(0,t),l.addColorStop(.35,t.replace(/[\d.]+\)$/,"0.55)")),l.addColorStop(1,r),s.fillStyle=l,s.fillRect(0,0,64,64);const n=new N(o);return n.colorSpace=V,n}const re=t=>{const r=Math.sin(t*127.1+311.7)*43758.5453;return r-Math.floor(r)};function ce(t,r,o,s=48){const l=new D(t,r,s,Math.round(s*r/t)).rotateX(-Math.PI/2),n=l.attributes.position.count,c=new Float32Array(n*3),m=o.map(i=>new R(i));for(let i=0;i<n;i++){const a=m[Math.floor(re(i)*m.length)];c[i*3]=a.r,c[i*3+1]=a.g,c[i*3+2]=a.b}return l.setAttribute("color",new E(c,3)),l}const fe=(t="#ffffff")=>x([[new M(.09,.12,.5,5),"#6b4a32",{p:[0,.25,0]}],[new w(.45,1.1,6),t,{p:[0,.95,0]}],[new w(.34,.8,6),t,{p:[0,1.35,0]}]]);new v(0,1,0);const ue=["#e5484d","#3e8ef7","#f5f5f2","#2b2f36","#f2b33d","#30a46c","#8e4ec6","#c2c7cf"],me=()=>({car:x([[new p(1.8,.55,4.2),"#ffffff",{p:[0,.55,0]}],[new p(1.55,.5,2.1),"#1c2230",{p:[0,1.05,-.25]}],...[[-.85,1.3],[.85,1.3],[-.85,-1.3],[.85,-1.3]].map(([t,r])=>[new M(.34,.34,.25,8).rotateZ(Math.PI/2),"#111111",{p:[t,.34,r]}])]),brake:x([[new p(.45,.18,.06),"#ffffff",{p:[-.6,.65,-2.12]}],[new p(.45,.18,.06),"#ffffff",{p:[.6,.65,-2.12]}]]),head:x([[new p(.4,.15,.06),"#ffffff",{p:[-.6,.62,2.12]}],[new p(.4,.15,.06),"#ffffff",{p:[.6,.62,2.12]}]])});export{ue as C,se as S,ae as a,le as b,me as c,ce as g,re as h,x as m,fe as t};
