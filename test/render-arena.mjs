// Headless render of the tournament ground from a few cameras (PNG files), for a visual check
// without a browser:  node test/render-arena.mjs [outDir]
import { writePNG } from './headless.mjs';
import { GPU, RenderTarget, readTexture, G } from '../src/engine/webgpu.js';
import { Scene, PerspectiveCamera } from '../src/engine/index.js';
import { Renderer } from '../src/core/Renderer.js';
import { loadEnvironment } from '../src/world/Environment.js';
import { Arena } from '../src/world/Arena.js';
import { setAtlasArms } from '../src/world/Materials.js';
import { randomArms } from '../src/game/Heraldry.js';
import { rng } from '../src/game/Rng.js';

const out = process.argv[ 2 ] || '/tmp';
await GPU.init( { headless: true } );
const W = 960, H = 540;
const r = rng( 3 );
for ( let s = 0; s < 8; s ++ ) setAtlasArms( s, randomArms( r ) );
const scene = new Scene();
const arena = new Arena();
scene.add( arena.group );
const extra = globalThis.__extraScene;
const renderer = new Renderer( { outputFormat: 'rgba8unorm' } );
G.horizonColor.value.copy( ( await loadEnvironment() ).horizon );
renderer.setSize( W, H );
const ldr = new RenderTarget( W, H, { colors: [ 'rgba8unorm' ], label: 'ldr', usage: [ 'render', 'copySrc', 'sample' ] } );
const camera = new PerspectiveCamera( 60, W / H, 0.1, 4000 );
const shots = {
	overview: [ [ - 30, 18, 36 ], [ 10, 0, - 5 ] ],
	rider: [ [ - 43, 3.4, 2.8 ], [ - 30, 2.2, 0 ] ],
	stand: [ [ 0, 2, 6 ], [ 0, 4, - 20 ] ],
	castle: [ [ 0, 6, 10 ], [ 60, 20, - 190 ] ],
	crowd: [ [ - 8, 2.4, 9 ], [ - 4, 2.2, 20 ] ],
	tilt: [ [ - 20, 1.6, 4 ], [ - 10, 1.0, 0 ] ],
};
for ( const [ name, [ p, t ] ] of Object.entries( shots ) ) {
	camera.position.set( ...p ); camera.lookAt( ...t );
	for ( let f = 0; f < 3; f ++ ) {
		G.time.value = f * 0.016;
		GPU.beginFrame();
		renderer.render( scene, camera, ldr.textures[ 0 ].view() );
		GPU.submit();
	}
	const img = await readTexture( ldr.textures[ 0 ] );
	writePNG( `${ out }/arena-${ name }.png`, W, H, new Uint8Array( img.data ) );
	console.log( 'wrote', name, renderer.meshRenderer.stats );
}
await new Promise( ( res ) => setTimeout( res, 200 ) );
process.exit( 0 );
