import { readFile, writeFile, mkdir, rename, access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
let directory=process.env.AGENTS_PRO_HOME||join(homedir(),'.agents-pro/harness');
export function configureSettings(storage){directory=storage;}
export async function getSettings(){
 const old=await readFile(join(homedir(),'Library/Application Support/VS Code Codex Pro 2/User/settings.json'),'utf8').then(JSON.parse).catch(()=>({}));
 const saved=await readFile(join(directory,'settings.json'),'utf8').then(JSON.parse).catch(()=>({}));
 return {send:false,cleanup:true,voiceSend:true,prompt:'',filesPinned:false,activity:false,python:process.env.AGENTS_PRO_MLX_PYTHON||old['codexPro.mlxPython']||'',modelPath:process.env.AGENTS_PRO_MLX_MODEL||old['codexPro.mlxWhisperModelPath']||'',ffmpeg:'/opt/homebrew/bin/ffmpeg',recordingsDirectory:join(directory,'recordings'),cleanupProvider:'codex-cli',cleanupModel:'gpt-5.6-luna',...saved};
}
let writes=Promise.resolve();
export function updateSettings(change){const result=writes.then(()=>saveSettings(change));writes=result.catch(()=>{});return result;}
async function saveSettings(change){
 const current=await getSettings(),next={...current};
 for(const [key,value] of Object.entries(change||{})){
  if(['send','cleanup','voiceSend','filesPinned','activity'].includes(key)){if(typeof value!=='boolean')throw Error('Invalid '+key);next[key]=value;}
  else if(['prompt','python','modelPath','ffmpeg','recordingsDirectory','cleanupProvider','cleanupModel'].includes(key)){if(typeof value!=='string'||value.length>30000)throw Error('Invalid '+key);next[key]=value;}
  else throw Error('Unknown setting '+key);
 }
 if(!['codex-cli','grok-cli'].includes(next.cleanupProvider))throw Error('Choose a CLI cleanup provider');
 if(!next.cleanupModel.trim())throw Error('Cleanup model is required');
 for(const key of ['python','ffmpeg','modelPath','recordingsDirectory'])if(next[key]!==current[key]){
  if(!isAbsolute(next[key]))throw Error(key+' must be an absolute path');
  if(key==='python'||key==='ffmpeg'){if(!(await stat(next[key]).catch(()=>null))?.isFile())throw Error(key+' is not an executable file');await access(next[key],constants.X_OK).catch(()=>{throw Error(key+' is not an executable file');});}
  else if(!(await stat(next[key]).catch(()=>null))?.isDirectory())throw Error(key+' must be an existing directory');
  if(key==='recordingsDirectory')await access(next[key],constants.W_OK);
 }
 next.settingsVersion=1;
 next.previousRecordingDirectories=[...new Set([...(current.previousRecordingDirectories||[]),current.recordingsDirectory])].filter(p=>p!==next.recordingsDirectory);
 await mkdir(directory,{recursive:true,mode:0o700});const file=join(directory,'settings.json'),temp=file+'.'+randomUUID();await writeFile(temp,JSON.stringify(next,null,2),{mode:0o600});await rename(temp,file);return next;
}
