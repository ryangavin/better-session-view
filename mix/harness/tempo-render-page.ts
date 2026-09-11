import { renderTempoScenarios } from './tempo-render.ts';

// Optional manual diagnostic page. The DSP suite calls the renderer directly.
const button=document.querySelector<HTMLButtonElement>('#run')!,result=document.querySelector<HTMLPreElement>('#result')!;
button.onclick=async()=>{
  button.disabled=true; result.dataset.complete='false';
  try{
    const report=await renderTempoScenarios(name=>{result.textContent=`Rendering ${name}…`;});
    result.textContent=JSON.stringify(report,null,2);
  }finally{result.dataset.complete='true';button.disabled=false;}
};
