import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const inputs=[
  {name:'fftw-3.3.11.tar.gz',url:'https://www.fftw.org/fftw-3.3.11.tar.gz',sha:'5630c24cdeb33b131612f7eb4b1a9934234754f9f388ff8617458d0be6f239a1'},
  {name:'libkeyfinder-2.2.8.tar.gz',url:'https://codeload.github.com/mixxxdj/libkeyfinder/tar.gz/c78e8372e0188c0a11b7b55a653ea0cbbbf70fa5',sha:'210befac118f9bf7205785f5896506d4ad64a8b3758afe2da01d9aa6304db32a'},
];
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const run=(file:string,args:string[],cwd?:string)=>execFileSync(file,args,{cwd,encoding:'utf8',maxBuffer:8*1024*1024});
/** Build-time only. The app carries an independently executable GPL helper + source. */
export async function prepareKeyfinder():Promise<void>{
  if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Bundled keyfinder currently supports macOS Apple Silicon; build on that target.');
  const mix=path.resolve(import.meta.dirname,'..'),bin=path.join(mix,'bin'),sourceBundle=path.join(bin,'keyfinder-source');
  const adapter=path.join(mix,'native/keyfinder.cpp'),binary=path.join(bin,'keyfinder'),stamp=path.join(bin,'keyfinder.build');
  const recipe=await fs.readFile(import.meta.filename),adapterBytes=await fs.readFile(adapter);
  const fingerprint=digest(Buffer.concat([recipe,adapterBytes,Buffer.from(process.arch)]));
  try{
    if(await fs.readFile(stamp,'utf8')===fingerprint&&run(binary,['--version']).trim()==='2.2.8'){
      for(const name of ['COPYING.libkeyfinder','COPYING.fftw','keyfinder.cpp','keyfinder-build.ts','README.txt'])await fs.access(path.join(sourceBundle,name));
      for(const input of inputs)if(digest(await fs.readFile(path.join(sourceBundle,input.name)))!==input.sha)throw new Error('Missing matching corresponding source');
      return;
    }
  }catch{/* Build/repair missing tools or corresponding source. */}
  await fs.mkdir(sourceBundle,{recursive:true});
  for(const input of inputs){
    const file=path.join(sourceBundle,input.name);let bytes:Buffer;
    try{bytes=await fs.readFile(file);}catch{console.log(`keyfinder: fetching ${input.name}`);const response=await fetch(input.url);if(!response.ok)throw new Error(`${input.url}: ${response.status}`);bytes=Buffer.from(await response.arrayBuffer());}
    if(digest(bytes)!==input.sha)throw new Error(`Checksum mismatch: ${input.name}`);
    await fs.writeFile(file,bytes);
  }
  const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'mix-keyfinder-build-'));
  try{
    for(const input of inputs)run('tar',['-xzf',path.join(sourceBundle,input.name),'-C',scratch]);
    const fftw=path.join(scratch,'fftw-3.3.11'),key=path.join(scratch,'libkeyfinder-c78e8372e0188c0a11b7b55a653ea0cbbbf70fa5'),prefix=path.join(scratch,'prefix'),build=path.join(scratch,'build');
    console.log('keyfinder: building standalone static FFTW + libkeyfinder');
    run(path.join(fftw,'configure'),[`--prefix=${prefix}`,'--disable-shared','--enable-static','--disable-fortran','--disable-doc','CFLAGS=-O2 -mmacosx-version-min=13.0'],fftw);
    run('make',['-j2'],fftw);run('make',['install'],fftw);
    run('cmake',['-S',key,'-B',build,`-DCMAKE_INSTALL_PREFIX=${prefix}`,'-DBUILD_TESTING=OFF','-DBUILD_SHARED_LIBS=OFF','-DCMAKE_BUILD_TYPE=Release','-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0',`-DFFTW3_INCLUDE_DIR=${prefix}/include`,`-DFFTW3_LIBRARY=${prefix}/lib/libfftw3.a`]);
    run('cmake',['--build',build,'--parallel','2']);run('cmake',['--install',build]);
    const next=path.join(bin,'keyfinder.next');
    run('clang++',['-std=c++11','-O2','-mmacosx-version-min=13.0',adapter,`-I${prefix}/include`,`${prefix}/lib/libkeyfinder.a`,`${prefix}/lib/libfftw3.a`,'-o',next]);
    const libraries=run('otool',['-L',next]).trim().split('\n').slice(1).map(line=>line.trim().split(' ')[0]);
    if(libraries.some(l=>!l.startsWith('/usr/lib/')&&!l.startsWith('/System/Library/')))throw new Error('Keyfinder depends on a non-system dylib');
    if(run(next,['--version']).trim()!=='2.2.8')throw new Error('Keyfinder version probe failed');
    await fs.copyFile(path.join(key,'LICENSE'),path.join(sourceBundle,'COPYING.libkeyfinder'));
    await fs.copyFile(path.join(fftw,'COPYING'),path.join(sourceBundle,'COPYING.fftw'));
    await fs.writeFile(path.join(sourceBundle,'keyfinder.cpp'),adapterBytes);
    await fs.writeFile(path.join(sourceBundle,'keyfinder-build.ts'),recipe);
    await fs.writeFile(path.join(sourceBundle,'README.txt'),`Standalone keyfinder helper: GPL-3.0-or-later. FFTW and libkeyfinder are statically linked only into this separate command, not into Electron or FFmpeg. Root application license remains MIT.\n\nCorresponding source archives, helper source, licenses and build recipe are included here.\nTo rebuild on macOS arm64 with Node (TypeScript support), clang, make and CMake:\n1. Create a folder with mix/native, mix/tools and mix/bin/keyfinder-source.\n2. Copy keyfinder.cpp to mix/native/keyfinder.cpp and keyfinder-build.ts to mix/tools/keyfinder.ts.\n3. Copy both tar.gz archives to mix/bin/keyfinder-source.\n4. From that folder: node --input-type=module -e "import('./mix/tools/keyfinder.ts').then(m=>m.prepareKeyfinder())"\n\n${inputs.map(i=>`${i.name}\n${i.url}\nSHA256 ${i.sha}`).join('\n\n')}\n\nProtocol: keyfinder FILE (mono 44100 Hz little-endian float32 PCM), emits JSON label/score; --version reports library version.\nBuild fingerprint: ${fingerprint}\n`);
    await fs.rename(next,binary);await fs.writeFile(stamp,fingerprint);
  }finally{await fs.rm(scratch,{recursive:true,force:true});}
}
