// Headless render of knights (every helm, a gallop pose, the charge camera):  node test/render-knight.mjs [outDir]
import { writePNG } from './headless.mjs';
import { GPU, RenderTarget, readTexture, G } from '../src/engine/webgpu.js';
import { Scene, PerspectiveCamera, Vector3 } from '../src/engine/index.js';
import { Renderer } from '../src/core/Renderer.js';
import { Arena } from '../src/world/Arena.js';
import { Knight } from '../src/world/Knight.js';
import { setAtlasArms } from '../src/world/Materials.js';
import { OPPONENTS } from '../src/game/Tournament.js';
import { DEFAULT_KNIGHT, HELM_IDS } from '../src/game/Options.js';

const out = process.argv[ 2 ] || '/tmp';
await GPU.init( { headless: true } );
const W = 960, H = 540;
setAtlasArms( 0, DEFAULT_KNIGHT.arms );
for ( const o of OPPONENTS ) setAtlasArms( o.slot, o.arms );
const scene = new Scene();
const arena = new Arena();
scene.add( arena.group );
const knights = [];
const all = [ { ...DEFAULT_KNIGHT, slot: 0 }, ...OPPONENTS ];
all.forEach( ( o, i ) => {
	const k = new Knight( { ...o, helm: HELM_IDS[ i % HELM_IDS.length ] }, o.slot );
	k.group.position.set( - 8 + i * 3.2, 0, 4 );
	k.group.rotation.y = - 0.5;
	scene.add( k.group, k.lance );
	knights.push( k );
} );
const renderer = new Renderer( { outputFormat: 'rgba8unorm' } );
renderer.setSize( W, H );
const ldr = new RenderTarget( W, H, { colors: [ 'rgba8unorm' ], label: 'ldr', usage: [ 'render', 'copySrc', 'sample' ] } );
const camera = new PerspectiveCamera( 50, W / H, 0.1, 4000 );
async function shot( name, p, t, setup ) {
	camera.position.set( ...p ); camera.lookAt( ...t );
	for ( let f = 0; f < 3; f ++ ) {
		G.time.value = 1 + f * 0.016;
		if ( setup ) setup( f );
		for ( const k of knights ) k.update( 0.016, G.time.value );
		GPU.beginFrame(); renderer.render( scene, camera, ldr.textures[ 0 ].view() ); GPU.submit();
	}
	const img = await readTexture( ldr.textures[ 0 ] );
	writePNG( `${ out }/knight-${ name }.png`, W, H, new Uint8Array( img.data ) );
	console.log( 'wrote', name );
}
await shot( 'lineup', [ 0, 2.4, 12 ], [ 0, 1.6, 4 ] );
await shot( 'close', [ - 5.5, 2.4, 7.2 ], [ - 7.6, 2.0, 4 ] );
// side view and a helm close-up, with the others moved out of the way
for ( const k of knights.slice( 1 ) ) k.group.position.y = - 50;
knights[ 0 ].group.rotation.y = 0;
knights[ 0 ].lance.visible = false;
await shot( 'side', [ - 8, 1.8, 9.5 ], [ - 8, 1.4, 4 ] );
await shot( 'rider', [ - 6.2, 2.8, 5.6 ], [ - 7.9, 2.3, 4 ] );
knights[ 0 ].lance.visible = true;
for ( const k of knights.slice( 1 ) ) k.group.position.y = 0;
// gallop: knight 0 at speed, lance couched toward a point
const k0 = knights[ 0 ];
await shot( 'gallop', [ - 3, 2.2, 9 ], [ - 8, 1.6, 4 ], () => { k0.speed = 11; k0.lanceAim = new Vector3( 0, 2.3, 0 ); for ( let i = 0; i < 20; i ++ ) k0.update( 0.016, 1 ); } );
await new Promise( ( r ) => setTimeout( r, 200 ) );
process.exit( 0 );
