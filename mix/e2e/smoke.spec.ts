import { test, expect, type Page } from '@playwright/test';
import type { SmokeState } from '../harness/smoke.tsx';

const read = (page:Page):Promise<SmokeState> => page.evaluate(()=>window.mixSmoke!.read());
const titles = (page:Page) => page.locator('.mf-song-title');
const errors = new WeakMap<Page,string[]>();
const deck = (page:Page,index:number) => page.getByLabel(`Deck ${String.fromCharCode(65+index)} — drop a library track`,{exact:true}).and(page.locator('.play-deck'));
async function load(page:Page,title:string,index:number) {
  await page.getByRole('button',{name:`${title} — Aperture`,exact:true}).dragTo(deck(page,index));
  await expect(deck(page,index).getByRole('heading',{name:title,exact:true})).toBeVisible();
  await expect.poll(async()=>(await read(page)).state.decks[index].status).toBe('ready');
}

test.beforeEach(async({page,baseURL})=>{
  const failures:string[]=[]; errors.set(page,failures);
  page.on('pageerror',error=>failures.push(error.message));
  // Reject every native/external boundary. This fixture never imports main/preload/controllers.
  await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin===baseURL) return route.continue();
    failures.push(`Forbidden request: ${route.request().url()}`);
    return route.abort('blockedbyclient');
  });
  await page.routeWebSocket('**/*',socket=>{
    if(new URL(socket.url()).host===new URL(baseURL!).host) socket.connectToServer();
    else { failures.push(`Forbidden socket: ${socket.url()}`); socket.close(); }
  });
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'requestMIDIAccess',{value:()=>{throw new Error('MIDI is forbidden in browser smoke');}});
  });
  await page.goto('/harness/smoke.html');
  await expect(titles(page)).toHaveCount(4);
  await expect.poll(async()=>(await read(page)).monitoring).toBe(false);
});

test.afterEach(async({page},info)=>{
  expect(errors.get(page),'Uncaught renderer errors').toEqual([]);
  if (!page.isClosed()) await info.attach('engine-state',{
    body:JSON.stringify(await read(page),null,2),contentType:'application/json',
  });
});

test('library filters recover from no results and sorting updates real rows',async({page})=>{
  await page.getByRole('listbox',{name:'Artists',exact:true}).selectOption({label:'Aperture'});
  await page.getByRole('listbox',{name:'Albums',exact:true}).selectOption({label:'Ceremony'});
  await page.getByRole('listbox',{name:'Keys',exact:true}).selectOption({label:'C major'});
  await expect(titles(page)).toHaveText(['Vessel']);
  await page.getByRole('textbox',{name:'Filter the library'}).fill('no such song');
  await expect(page.getByText('Nothing matches that.',{exact:true})).toBeVisible();
  await expect(page.getByRole('listbox',{name:'Artists'}).getByRole('option',{name:'Aperture',exact:true})).toBeAttached();
  await page.getByRole('button',{name:'Reset filters',exact:true}).click();
  await expect(titles(page)).toHaveCount(4);
  await page.getByRole('columnheader',{name:'Song',exact:true}).getByRole('button').click();
  await expect(titles(page)).toHaveText(['Demo','Low Tide','Unfiled','Vessel']);
  await page.getByRole('columnheader',{name:'Song',exact:true}).getByRole('button').click();
  await expect(titles(page)).toHaveText(['Vessel','Unfiled','Low Tide','Demo']);
});

test('column drag and keyboard width persist through renderer reload',async({page})=>{
  await page.getByRole('columnheader',{name:'Song',exact:true}).dragTo(page.getByRole('columnheader',{name:'Album',exact:true}));
  const headers = page.getByRole('columnheader');
  await expect.poll(()=>headers.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label'))))
    .toEqual(['Artist','Song','Album','BPM','Key','Analysis','Stems']);
  const width = page.getByRole('separator',{name:'Song column width',exact:true});
  const before=Number(await width.getAttribute('aria-valuenow'));
  await width.focus(); await page.keyboard.press('ArrowRight');
  await expect(width).toHaveAttribute('aria-valuenow',String(before+8));
  await page.reload();
  await expect.poll(()=>headers.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label'))))
    .toEqual(['Artist','Song','Album','BPM','Key','Analysis','Stems']);
  await expect(width).toHaveAttribute('aria-valuenow',String(before+8));
});

test('drag loads only the target deck, leaves Prep selection alone and never starts it',async({page})=>{
  await load(page,'Vessel',2);
  const result=await read(page);
  expect(result.selected).toBeNull();
  expect(result.state.decks[0].status).toBe('empty');
  expect(result.state.decks[2].playing).toBe(false);
  expect(Object.values(result.frame.decks['deck-c'].sources!).every(source=>!source.playing)).toBe(true);
  expect(result.state.running).toBe(false);
});

test('real Cue pointer release restores position; keyboard Play latch survives release',async({page})=>{
  await load(page,'Vessel',0);
  const cue=page.getByRole('button',{name:'Deck 1 transport cue',exact:true});
  const at=(await read(page)).frame.decks['deck-a'].seconds!;
  const box=(await cue.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
  await expect.poll(async()=>(await read(page)).frame.decks['deck-a'].seconds!).toBeGreaterThan(at+.1);
  // Real pointer capture must deliver an outside release to the held Cue.
  await page.mouse.move(1,1); await page.mouse.up();
  await expect.poll(async()=>(await read(page)).state.decks[0].playing).toBe(false);
  expect((await read(page)).frame.decks['deck-a'].seconds).toBeCloseTo(at,5);
  await cue.focus(); await page.keyboard.down('Space');
  await expect.poll(async()=>(await read(page)).frame.decks['deck-a'].seconds!).toBeGreaterThan(at+.1);
  await page.keyboard.press('Enter'); await page.keyboard.up('Space');
  await expect.poll(async()=>(await read(page)).state.decks[0].cueHeld).toBe(false);
  expect((await read(page)).state.decks[0].playing).toBe(true);
  const latched=(await read(page)).frame.decks['deck-a'].seconds!;
  await expect.poll(async()=>(await read(page)).frame.decks['deck-a'].seconds!).toBeGreaterThan(latched+.1);
});

for (const sync of [false,true]) test(`offbeat Cue with running reference: Sync ${sync?'on aligns':'off preserves timing'} at Play latch`,async({page},info)=>{
  await load(page,'Vessel',0); await load(page,'Low Tide',1);
  if(sync) {
    await page.getByRole('button',{name:'Deck 2 sync',exact:true}).click();
    await expect.poll(async()=>(await read(page)).state.decks[1].synced).toBe(true);
  }
  await page.getByRole('button',{name:'Deck 1 play/pause',exact:true}).click();
  await expect.poll(async()=>(await read(page)).state.decks[0].syncLeader).toBe(true);
  await page.getByRole('button',{name:'Deck 2 transport cue',exact:true}).focus();
  // Observe the actual engine clock; no fake timers or engine mutation to arrange phase.
  await page.waitForFunction(()=>{
    const beat=window.mixSmoke!.read().frame.decks['deck-a'].beat;
    return beat%1>.35 && beat%1<.45;
  });
  await page.keyboard.down('Space');
  await expect.poll(async()=>(await read(page)).frame.decks['deck-b'].seconds!).toBeGreaterThan(.1);
  const phase=async()=>{
    const {frame}=await read(page);
    return ((frame.decks['deck-b'].beat-frame.decks['deck-a'].beat+.5)%1+1)%1-.5;
  };
  const audition=await phase();
  expect(Math.abs(audition),'Audition must remain deliberately off the reference beat').toBeGreaterThan(.15);
  await page.keyboard.press('Enter');
  const pressedAt=(await read(page)).frame.decks['deck-a'].seconds!;
  await expect.poll(async()=>(await read(page)).frame.decks['deck-a'].seconds!).toBeGreaterThan(pressedAt+.2);
  if(sync) await expect.poll(async()=>Math.abs(await phase()),{message:'Latch aligns while Cue is still held'}).toBeLessThan(.06);
  else await expect.poll(async()=>Math.abs((await phase())-audition)).toBeLessThan(.06);
  const latched=await phase();
  await page.keyboard.up('Space');
  await expect.poll(async()=>(await read(page)).state.decks[1].cueHeld).toBe(false);
  expect((await read(page)).state.decks[1].playing).toBe(true);
  const at=(await read(page)).frame.decks['deck-b'].seconds!;
  await expect.poll(async()=>(await read(page)).frame.decks['deck-b'].seconds!).toBeGreaterThan(at+.1);
  expect((await read(page)).state.decks[0].playing).toBe(true);
  const afterRelease=await phase();
  expect(Math.abs(sync?afterRelease:afterRelease-audition),'Release retains the latched phase').toBeLessThan(.06);
  await info.attach('phase-evidence',{body:JSON.stringify({sync,audition,latched,afterRelease}),contentType:'application/json'});
});
