import { useCallback, useEffect, useMemo, useState } from 'react';
import { Harness, Toolbar, Group } from '@openflow/widgets/debug/Harness.tsx';
import { Scope, ScopeRow } from '@openflow/widgets/debug/Scope.tsx';
import { useAxis } from '@openflow/widgets/debug/useAxis.ts';
import { useRemembered } from '@openflow/widgets/debug/useRemembered.ts';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { View } from '@openflow/widgets/debug/axis.ts';
import type { Mix } from '../../state.ts';
import { LegacyRMS } from './LegacyRMS.tsx';
import { paintTopology, paintActivity, paintTime } from './topologyPaint.ts';
import type { ColorMode } from './topology.ts';
import { measure } from '../waveforms/measure.ts';
import { prepare, type Model } from './model.ts';
import { Slider } from '@openflow/widgets/controls/Slider.tsx';
import { DEFAULT_STYLE, PRESETS, styleOf, type Style } from './style.ts';
import './waveform-v2.css';
export function WaveformV2({mix}:{mix:Mix}){
  const songs=mix.songs.filter(s=>s.stems&&s.sources.length);
  return <Harness title="Waveform V2" className="mf-waveform-v2" subject={<Select label="Waveform V2 track" items={songs.map(s=>s.title)} index={Math.max(0,songs.findIndex(s=>s.id===mix.song?.id))} onChange={i=>{if(songs[i])mix.select(songs[i].id);}} width={240}/> }>
    {mix.song&&!mix.decoding&&mix.playable?<TrackView key={mix.song.id} mix={mix}/>:<p>{mix.audioProblem||(mix.decoding?'Decoding stems…':'Choose a separated track to view its waveform.')}</p>}
  </Harness>;
}
function TrackView({mix}:{mix:Mix}){
  const [large,setLarge]=useRemembered('mix-waveform-v2-large',false);
  const [stems,setStems]=useRemembered('mix-waveform-v2-stems',false);
  const [saved,save]=useRemembered<unknown>('mix-waveform-v2-style',DEFAULT_STYLE);
  const style=useMemo(()=>styleOf(saved),[saved]);
  const change=(patch:Partial<Style>)=>save({...style,...patch});
  const [band,setBand]=useState(0);
  const [legacy,setLegacy]=useState(false);
  const [deckHeight]=useState(()=>Math.round(document.querySelector('.play-wave-lane')?.clientHeight||72));
  const [model,setModel]=useState<Model|null>(null),[error,setError]=useState('');
  const sources=mix.song!.sources,audioOf=mix.audioOf;
  useEffect(()=>{
    const cancel=new AbortController();setModel(null);setError('');
    const input=sources.flatMap(id=>{const b=audioOf(id);return b?[{id,channels:Array.from({length:b.numberOfChannels},(_,c)=>b.getChannelData(c))}]:[];});
    void measure(input,mix.rate,cancel.signal).then(data=>{if(!cancel.signal.aborted)setModel(prepare(data));}).catch(e=>{if(!cancel.signal.aborted)setError(String(e));});
    return()=>cancel.abort();
  },[sources,audioOf,mix.rate]);
  const axis=useAxis({seconds:mix.seconds,narrowest:Math.max(.1,mix.seconds/16384*100)});
  return <>
    <Toolbar>
      <Group caption="Starting point"><Select label="Waveform starting point" items={[...PRESETS.map(p=>p.name),'Custom']} index={Math.max(0,PRESETS.findIndex(p=>JSON.stringify(p.style)===JSON.stringify(style))<0?PRESETS.length:PRESETS.findIndex(p=>JSON.stringify(p.style)===JSON.stringify(style)))} onChange={i=>{if(PRESETS[i])save(PRESETS[i].style);}} width={170}/><Button onPress={()=>save(DEFAULT_STYLE)}>Reset style</Button></Group>
      <Group caption="View"><Toggle width={90} on={large} onChange={setLarge}>Larger view</Toggle><Toggle width={90} on={stems} onChange={setStems}>Stem activity</Toggle></Group>
      <Group caption="Range"><Button onPress={axis.whole}>Whole track</Button><Button label="Zoom V2 in" onPress={()=>axis.zoom(.5,.5)}>+</Button><Button label="Zoom V2 out" onPress={()=>axis.zoom(2,.5)}>−</Button></Group>
    </Toolbar>
    <div className="mf-v2-tuning">
      {([['smooth','Smoothness',0,1],['detail','Detail',.5,2],['height','Height ratio',.4,.95],['blend','Color strength',0,100]] as const).map(([key,label,min,max])=><StyleSlider key={key} label={label} value={style[key]} min={min} max={max} initial={DEFAULT_STYLE[key]} onChange={value=>change({[key]:value})}/>)}
    </div>
    <details className="mf-v2-colors"><summary>Palette & layer balance</summary><div className="mf-v2-tuning">
      <Select label="Frequency band" items={['Low frequencies','Mid frequencies','High frequencies']} index={band} onChange={setBand} width={150}/>
      {([['hues','Hue',359],['saturation','Saturation',100],['lightness','Lightness',100]] as const).map(([key,label,max])=><StyleSlider key={key} label={label} value={style[key][band]} min={0} max={max} initial={DEFAULT_STYLE[key][band]} onChange={value=>{const values=[...style[key]] as Style['hues'];values[band]=value;change({[key]:values});}}/>)}
      <StyleSlider label="Edge" value={style.edge} min={0} max={1} initial={DEFAULT_STYLE.edge} onChange={edge=>change({edge})}/>
      <StyleSlider label="Low / mid" value={style.low} min={.25} max={3} initial={1} onChange={low=>change({low})}/>
      <StyleSlider label="High / mid" value={style.high} min={.25} max={3} initial={1} onChange={high=>change({high})}/>
    </div></details>
    <p className="mf-v2-note">Shared production outline engine · layered bands and blended spectrum. Presets are visual starting points, not proprietary analysis emulations.</p>
    {error||!model?<p className="mf-v2-reading" role="status">{error||'Measuring decoded stems…'}</p>:<Scope axis={axis} labels={100}>
      <ScopeRow label="Source time" height={24} ruler draw={paintTime}/>
      <TopologyRow label="Three-band" height={deckHeight} model={model} mode="three-band" style={style}/>
      <TopologyRow label="Spectrum" height={deckHeight} model={model} mode="rgb" style={style}/>
      {large&&<><TopologyRow label="3-band large" height={220} model={model} mode="three-band" style={style}/><TopologyRow label="RGB large" height={220} model={model} mode="rgb" style={style}/></>}
      {stems&&model.data.stems.map((stem,i)=><ActivityRow key={stem.id} model={model} index={i}/>)}
    </Scope>}
    <p className="mf-v2-note">{deckHeight}px deck preview · decoded stem sum · fixed whole-track peak. Scroll to pan; Shift-scroll to zoom.{stems?' Separate strips: stem RMS activity, −60 to 0 dBFS.':''}</p>
    <details className="mf-v2-legacy" onToggle={e=>setLegacy(e.currentTarget.open)}><summary>Legacy RMS experiment</summary>{legacy&&<LegacyRMS mix={mix}/>}</details>
  </>;
}
function TopologyRow({label,height,model,mode,style}:{label:string;height:number;model:Model;mode:ColorMode;style:Style}){
  const draw=useCallback((g:CanvasRenderingContext2D,v:View)=>paintTopology(g,v,model,mode,style),[model,mode,style]);
  return <ScopeRow label={label} height={height} draw={draw}/>;
}
function ActivityRow({model,index}:{model:Model;index:number}){
  const draw=useCallback((g:CanvasRenderingContext2D,v:View)=>paintActivity(g,v,model,index),[model,index]);
  return <ScopeRow label={`${model.data.stems[index].id} · RMS`} height={14} draw={draw}/>;
}

function StyleSlider({label,value,min,max,initial,onChange}:{label:string;value:number;min:number;max:number;initial:number;onChange:(value:number)=>void}){
  const param=useMemo(()=>({kind:'float' as const,name:label,min,max,defaultValue:initial}),[label,min,max,initial]);
  return <div className="mf-v2-slider"><span>{label}</span><Slider name="" label={label} param={param} value={value} onChange={onChange} orientation="horizontal" layout="inside" fill length="auto" display={max>3?`${Math.round(value)}`:value.toFixed(2)}/></div>;
}
