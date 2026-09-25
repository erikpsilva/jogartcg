import { useEffect, useRef, useState } from 'react';

const vertex = 'attribute vec2 pos; varying vec2 uv; void main(){uv=vec2((pos.x+1.0)*.5,(1.0-pos.y)*.5);gl_Position=vec4(pos,0.,1.);}';
const fragment = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 uv; uniform sampler2D art; uniform float time; uniform float power;
float mask(vec2 p,vec2 c,vec2 r){return 1.-smoothstep(.58,1.,length((p-c)/r));}
void main(){vec2 p=uv;vec2 d=vec2(0.);float t=time*1.25;
// Soft, local motion avoids moving Hades' face and the entire camera.
float a=mask(p,vec2(.12,.58),vec2(.055,.185));
float b=mask(p,vec2(.31,.29),vec2(.039,.18));
float c=mask(p,vec2(.281,.87),vec2(.076,.26));
float e=mask(p,vec2(.643,.31),vec2(.043,.16));
float f=mask(p,vec2(.735,.8),vec2(.057,.23));
d.y+=(a*sin(t*.95)+b*sin(t*.81+1.4)+c*sin(t*.67+2.8)+e*sin(t*.93+3.7)+f*sin(t*.73+4.8))*.013;
d.x+=(a*sin(t*.65)+b*sin(t*.7+1.)+e*sin(t*.6+2.)+f*sin(t*.55+4.))*.0017;
float flame=mask(p,vec2(.489,.069),vec2(.029,.091));
d.x+=flame*(sin(p.y*72.-t*3.8)*.004+sin(t*2.4)*.002);
d.y+=flame*sin(p.x*115.+t*3.)*.008;
float mist=mask(p,vec2(.225,.49),vec2(.068,.48))+mask(p,vec2(.69,.48),vec2(.058,.38));
d.x+=mist*sin(p.y*18.-t*.6)*.0018;
vec3 color=texture2D(art,clamp(p+d*power,vec2(.001),vec2(.999))).rgb;
float cyan=smoothstep(.08,.3,color.b-color.r)*smoothstep(.25,.7,color.g);
color+=vec3(.015,.06,.08)*cyan*(flame*(.5+.5*sin(t*3.5))+mist*.22*(.5+.5*sin(t+p.y*13.)))*power;
gl_FragColor=vec4(color,1.);}`;

/** Approved Hades image deformation. Static image remains underneath as fallback. */
export function LivingPlaymat({ src, intensity = .8, className = '' }: { src: string; intensity?: number; className?: string }) {
 const ref = useRef<HTMLCanvasElement>(null);
 const [generation, setGeneration] = useState(0);
 useEffect(() => {
  const canvas = ref.current;
  if (!canvas) return;
  canvas.style.opacity='1';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' });
  if (!gl) return;
  let frame = 0, visible = false, ready = false, disposed = false;
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null, texture: WebGLTexture | null = null;
  const cleanup = () => { cancelAnimationFrame(frame); if(texture) gl.deleteTexture(texture); if(buffer) gl.deleteBuffer(buffer); if(program) gl.deleteProgram(program); shaders.forEach(s=>gl.deleteShader(s)); };
  try {
   const compile = (type: number, source: string) => { const s = gl.createShader(type)!; shaders.push(s); gl.shaderSource(s, source); gl.compileShader(s); if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error('Shader compilation'); return s; };
   program = gl.createProgram()!; gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex)); gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment)); gl.linkProgram(program); if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error('Shader link'); gl.useProgram(program);
   buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
   const pos=gl.getAttribLocation(program,'pos'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
   const clock=gl.getUniformLocation(program,'time'), strength=gl.getUniformLocation(program,'power');
   texture=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   let last=0, elapsed=0;
   // All shader time frequencies repeat after 200*pi. Bounded local time avoids
   // losing frame-sized increments on mobile GPUs with mediump precision.
   const draw=(ms:number)=>{if(disposed || !ready || !visible || document.hidden) return; if(!last || ms-last>=32){if(last)elapsed=(elapsed+Math.min(ms-last,100)*.001)%(200*Math.PI/1.25);gl.uniform1f(clock,elapsed);gl.uniform1f(strength,reduced.matches?0:Math.max(0,Math.min(1.5,intensity)));gl.drawArrays(gl.TRIANGLES,0,6);last=ms;} if(!reduced.matches)frame=requestAnimationFrame(draw);};
   const restart=()=>{cancelAnimationFrame(frame);last=0;draw(performance.now());};
   const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;restart();}); observer.observe(canvas);
   const img=new Image(); img.onload=()=>{if(disposed)return;gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img);ready=true;restart();}; img.src=src;
   const lost=(event: Event)=>{event.preventDefault();ready=false;cancelAnimationFrame(frame);canvas.style.opacity='0';};
   const restored=()=>setGeneration(value=>value+1);
   canvas.addEventListener('webglcontextrestored',restored);
   canvas.addEventListener('webglcontextlost',lost); document.addEventListener('visibilitychange',restart); reduced.addEventListener('change',restart);
   return ()=>{disposed=true;img.onload=null;observer.disconnect();document.removeEventListener('visibilitychange',restart);reduced.removeEventListener('change',restart);canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);cleanup();};
  } catch { cleanup(); }
 },[src,intensity,generation]);
 return <canvas ref={ref} className={className} width={1016} height={279} aria-hidden="true" style={{pointerEvents:'none'}} />;
}
