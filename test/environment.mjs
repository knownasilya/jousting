// The sky panorama: the Radiance reader, half floats, and the terrain height function.
import { readFileSync } from 'node:fs';
import { parseHDR, toHalf } from '../src/world/Environment.js';
import { heightAt, CASTLE } from '../src/world/Terrain.js';

let failed = 0;
const check = ( name, ok ) => { console.log( ( ok ? 'ok   ' : 'FAIL ' ) + name ); if ( ! ok ) failed ++; };

const b = readFileSync( new URL( '../public/assets/env/quarry_01_1k.hdr', import.meta.url ) );
const hdr = parseHDR( b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) );
check( 'HDRI is 1024 x 512', hdr.width === 1024 && hdr.height === 512 );
let max = 0, at = 0;
for ( let i = 0; i < hdr.width * hdr.height; i ++ ) if ( hdr.data[ i * 3 + 1 ] > max ) { max = hdr.data[ i * 3 + 1 ]; at = i; }
check( 'the sun is in the upper half and very bright', Math.floor( at / hdr.width ) < hdr.height / 2 && max > 1000 );
check( 'half floats', toHalf( 1 ) === 0x3c00 && toHalf( 0.5 ) === 0x3800 && toHalf( - 2 ) === 0xc000 && toHalf( 1e9 ) === 0x7bff && toHalf( 0 ) === 0 );
check( 'the lists are flat', Math.abs( heightAt( 0, 0 ) ) < 0.05 && Math.abs( heightAt( 60, 20 ) ) < 0.05 );
check( 'hills rise beyond the meadow', heightAt( 900, 300 ) > 20 );
check( 'the castle mound is level', Math.abs( heightAt( CASTLE.x, CASTLE.z ) - heightAt( CASTLE.x + 30, CASTLE.z - 20 ) ) < 0.01 );

if ( failed ) { console.log( failed + ' failed' ); process.exit( 1 ); }
console.log( '\nall passed' );
