/** Browser component integration: real UI/engine, generated assets, no preload or MIDI. */
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { ThemeRoot } from '@openflow/widgets/theme/ThemeRoot.tsx';
import { DEFAULT_THEME } from '@openflow/widgets/theme/theme.ts';
import '@openflow/widgets/palette.css';
import '@openflow/widgets/tokens.css';
import '../src/App.css';
import { Library } from '../src/components/Library.tsx';
import { PlayView } from '../src/play/PlayView.tsx';
import { useMixerViewModel } from '../src/play/useMixerViewModel.ts';
import { browseLibrary, listing, nextSort, type Browse, type Sort } from '../src/listing.ts';
import { useLibraryColumns } from '../src/useLibraryColumns.ts';
import type { Mix } from '../src/state.ts';
import type { Track } from '../src/openflow.ts';
import type { MixerEngine } from '../src/play/engine.ts';
import { fixture, fixtureTrack } from './dj-fixture.ts';

export type SmokeState = {
  state: {running:boolean;bpm:number;decks:Pick<ReturnType<MixerEngine['snapshot']>['decks'][number],
    'id'|'status'|'playing'|'cueHeld'|'synced'|'syncLeader'>[]};
  frame: ReturnType<MixerEngine['readFrame']>;
  monitoring: boolean;
  selected: string | null;
};
declare global { interface Window { mixSmoke?: { read(): SmokeState } } }

const tracks: Track[] = [
  { ...fixtureTrack, id:'vessel', title:'Vessel', artist:'Aperture', album:'Ceremony', key:'C major' },
  { ...fixtureTrack, id:'low-tide', title:'Low Tide', artist:'Aperture', album:'Ceremony', key:'A minor' },
  { ...fixtureTrack, id:'demo', title:'Demo', artist:'Aperture', album:'Long Division', key:'C major' },
  { ...fixtureTrack, id:'unknown', title:'Unfiled', artist:null, album:null, key:null },
];
const loadFixture = async (_track: Track, signal: AbortSignal) => {
  const asset = await fixture(new OfflineAudioContext(2, 1, 48000));
  signal.throwIfAborted();
  return asset;
};
const unavailable = () => { throw new Error('Native operation is outside this fixture'); };

function Smoke() {
  const [query,setQuery] = useState('');
  const [browse,setBrowse] = useState<Browse>({artist:null,album:null,key:null});
  const [sort,setSort] = useState<Sort>({order:'artist',descending:false});
  const [selected,select] = useState<string|null>(null);
  const [libraryWidth,setLibraryWidth] = useState(780);
  const columns = useLibraryColumns(undefined);
  const mixer = useMixerViewModel(tracks,'generated-smoke-fixture',loadFixture);
  useEffect(() => {
    mixer.engine.setMonitoring(false);
    // Read-only evidence. Tests drive production controls, never engine commands.
    window.mixSmoke = {read:()=>{
      const {running,bpm,decks}=mixer.engine.snapshot();
      return {state:{running,bpm,decks:decks.map(({id,status,playing,cueHeld,synced,syncLeader})=>
        ({id,status,playing,cueHeld,synced,syncLeader}))},frame:mixer.readFrame(),monitoring:mixer.engine.monitoring,selected};
    }};
    return () => { delete window.mixSmoke; };
  }, [mixer.engine,selected]);
  const libraryBrowser = browseLibrary(tracks,query,browse);
  // Only host state needed by Library. Native operations deliberately throw; no IPC stand-in.
  const mix = {
    library:{root:'generated-smoke-fixture',tracks}, libraryBrowser,
    songs:libraryBrowser.songs, rows:listing(libraryBrowser.songs,sort.order,sort.descending),
    total:tracks.length, query,setQuery,...sort,...columns,selected,select,
    libraryWidth,setLibraryWidth,
    browseArtist:(artist:string|null)=>setBrowse({artist,album:null,key:null}),
    browseAlbum:(album:string|null)=>setBrowse(was=>({...was,album,key:null})),
    browseKey:(key:string|null)=>setBrowse(was=>({...was,key})),
    resetLibraryFilters:()=>{setBrowse({artist:null,album:null,key:null});setQuery('');},
    sortBy:(order:Sort['order'])=>setSort(was=>nextSort(was,order)),
    loading:false,importing:false,notes:null,note:null,noteBad:false,artOf:()=>null,
    importTracks:unavailable,chooseFolder:unavailable,reveal:unavailable,
    editTrack:unavailable,refreshLibrary:unavailable,
  } as unknown as Mix;
  return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
    <header>Generated smoke fixture · speakers disabled · no desktop or MIDI connection</header>
    <div style={{display:'flex',flex:1,minHeight:0}}><Library mix={mix}/><PlayView mixer={mixer}/></div>
  </div>;
}

const root = createRoot(document.getElementById('root')!);
root.render(<ThemeRoot theme={DEFAULT_THEME}><Smoke/></ThemeRoot>);
if (import.meta.hot) import.meta.hot.dispose(()=>root.unmount());
