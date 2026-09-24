import { BufferGeometry, Float32BufferAttribute } from '../engine/index.js';

// The land round the tournament: a flat meadow for the lists and the pavilions, rising into
// rolling hills and a ring of higher downs on the horizon. `heightAt` is shared by the terrain
// mesh and everything placed on it (trees, the castle).

// smooth value noise (2D) with a fixed permutation, and fbm on top
const P = new Uint8Array( 512 );
{

	let s = 1234567;
	const p = [ ...Array( 256 ).keys() ];
	for ( let i = 255; i > 0; i -- ) {

		s = ( s * 16807 ) % 2147483647;
		const j = s % ( i + 1 );
		[ p[ i ], p[ j ] ] = [ p[ j ], p[ i ] ];

	}

	for ( let i = 0; i < 512; i ++ ) P[ i ] = p[ i & 255 ];

}

const fade = ( t ) => t * t * t * ( t * ( t * 6 - 15 ) + 10 );
const lat = ( x, y ) => P[ P[ x & 255 ] + ( y & 255 ) ] / 255;

export function noise2( x, y ) {

	const xi = Math.floor( x ), yi = Math.floor( y );
	const xf = x - xi, yf = y - yi;
	const u = fade( xf ), v = fade( yf );
	const a = lat( xi, yi ), b = lat( xi + 1, yi ), c = lat( xi, yi + 1 ), d = lat( xi + 1, yi + 1 );
	return ( a + ( b - a ) * u + ( c - a ) * v + ( a - b - c + d ) * u * v ) * 2 - 1;

}

export function fbm( x, y, oct = 5 ) {

	let s = 0, a = 0.5, f = 1;
	for ( let i = 0; i < oct; i ++ ) { s += noise2( x * f + i * 17.3, y * f - i * 9.1 ) * a; a *= 0.5; f *= 2.03; }
	return s;

}

const smooth = ( a, b, x ) => { const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); };

export const CASTLE = { x: 60, z: - 190, r: 62 };

export function heightAt( x, z ) {

	const r = Math.hypot( x, z );
	// the meadow is flat; beyond it the land rolls, then rises to the downs on the horizon
	const roll = ( fbm( x * 0.004, z * 0.004 ) * 0.5 + 0.5 ) * 38 + fbm( x * 0.015, z * 0.015, 3 ) * 6;
	let h = roll * smooth( 110, 420, r ) + smooth( 700, 1500, r ) * ( 60 + fbm( x * 0.002 + 3, z * 0.002, 3 ) * 70 );
	// the castle sits on a low mound of its own, levelled for the walls
	const dc = Math.hypot( x - CASTLE.x, z - CASTLE.z );
	h = h * smooth( CASTLE.r, CASTLE.r + 60, dc ) + 2.5 * ( 1 - smooth( CASTLE.r, CASTLE.r + 30, dc ) );
	return h - 0.02;

}

// a polar grid: fine near the lists, coarse on the horizon
export function terrainGeometry( { rings = 150, segments = 320, radius = 2600 } = {} ) {

	const pos = [], nrm = [], uv = [], idx = [];
	const radii = [ 0 ];
	for ( let i = 1; i <= rings; i ++ ) radii.push( radius * Math.pow( i / rings, 2.2 ) );
	for ( let i = 0; i <= rings; i ++ ) {

		for ( let j = 0; j < segments; j ++ ) {

			const a = j / segments * Math.PI * 2, r = radii[ i ];
			const x = Math.cos( a ) * r, z = Math.sin( a ) * r;
			const y = heightAt( x, z );
			pos.push( x, y, z );
			// normal from central differences
			const e = Math.max( 0.5, r * 0.004 );
			const nx = heightAt( x - e, z ) - heightAt( x + e, z ), nz = heightAt( x, z - e ) - heightAt( x, z + e );
			const l = Math.hypot( nx, 2 * e, nz );
			nrm.push( nx / l, 2 * e / l, nz / l );
			uv.push( x / 10, z / 10 );
			if ( i === 0 ) break; // the centre is a single vertex

		}

	}

	const row = ( i ) => i === 0 ? 0 : 1 + ( i - 1 ) * segments;
	for ( let j = 0; j < segments; j ++ ) idx.push( 0, 1 + ( j + 1 ) % segments, 1 + j );
	for ( let i = 1; i < rings; i ++ ) {

		for ( let j = 0; j < segments; j ++ ) {

			const a = row( i ) + j, b = row( i ) + ( j + 1 ) % segments, c = row( i + 1 ) + j, d = row( i + 1 ) + ( j + 1 ) % segments;
			idx.push( a, b, c, b, d, c );

		}

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new Float32BufferAttribute( nrm, 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uv, 2 ) );
	g.setIndex( idx );
	g.computeBoundingSphere();
	return g;

}
