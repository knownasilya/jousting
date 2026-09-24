import { BufferGeometry, Float32BufferAttribute, Vector3 } from '../engine/index.js';

// Lofted surfaces: cross-sections swept along a spine. The sections are smoothed with Catmull-Rom,
// so a handful of control rings gives a smooth, organic shape (a horse's barrel, a neck, a
// breastplate).
//
//   loft( [ { p: [ x, y, z ], w, up, down, n, crest, keel }, ... ], { seg: 24, steps: 4, cap: [ true, true ] } )
//
// Per ring: p = centre; w = half-width along the side axis; up / down = half-heights above and below
// the centre; n = superellipse exponent (2 ellipse, 3-4 boxier, <2 pinched); crest / keel = a ridge
// along the top / bottom. The side axis is horizontal and square to the spine (or the given `side`,
// made square to it); `up` is square to both. UV: u runs around the section, v along the spine.

const _t = new Vector3(), _s = new Vector3(), _u = new Vector3();
const WORLD_UP = new Vector3( 0, 1, 0 );

const cr = ( p0, p1, p2, p3, t ) => {

	const t2 = t * t, t3 = t2 * t;
	return 0.5 * ( 2 * p1 + ( - p0 + p2 ) * t + ( 2 * p0 - 5 * p1 + 4 * p2 - p3 ) * t2 + ( - p0 + 3 * p1 - 3 * p2 + p3 ) * t3 );

};

const KEYS = [ 'w', 'up', 'down', 'n', 'keel', 'crest' ];

function smooth( rings, steps ) {

	const out = [];
	const n = rings.length;
	const get = ( i ) => rings[ Math.max( 0, Math.min( n - 1, i ) ) ];
	for ( let i = 0; i < n - 1; i ++ ) {

		const r0 = get( i - 1 ), r1 = get( i ), r2 = get( i + 1 ), r3 = get( i + 2 );
		for ( let k = 0; k < steps; k ++ ) {

			const t = k / steps;
			const r = { p: [ 0, 1, 2 ].map( ( j ) => cr( r0.p[ j ], r1.p[ j ], r2.p[ j ], r3.p[ j ], t ) ) };
			for ( const key of KEYS ) r[ key ] = cr( r0[ key ] ?? def( key, r0 ), r1[ key ] ?? def( key, r1 ), r2[ key ] ?? def( key, r2 ), r3[ key ] ?? def( key, r3 ), t );
			out.push( r );

		}

	}

	const last = { ...rings[ n - 1 ] };
	for ( const key of KEYS ) last[ key ] = last[ key ] ?? def( key, last );
	out.push( last );
	return out;

}

function def( key, r ) {

	if ( key === 'up' || key === 'down' ) return r.h ?? r.w;
	if ( key === 'n' ) return 2;
	return 0; // keel (a ridge pulled down at the bottom), crest (a ridge pushed up at the top)

}

// the superellipse point at angle a (0 = +side, PI/2 = up)
function section( r, a ) {

	const c = Math.cos( a ), s = Math.sin( a );
	const e = 2 / r.n;
	let x = Math.sign( c ) * Math.pow( Math.abs( c ), e ) * r.w;
	let y = Math.sign( s ) * Math.pow( Math.abs( s ), e ) * ( s >= 0 ? r.up : r.down );
	// ridges: a crest along the top (breastplate ridge, a horse's crest) and a keel underneath
	if ( r.crest && s > 0 ) y += r.crest * Math.pow( s, 12 );
	if ( r.keel && s < 0 ) y -= r.keel * Math.pow( - s, 8 );
	return [ x, y ];

}

export function loft( rings, { seg = 24, steps = 4, cap = [ true, true ], side = null, arc = null } = {} ) {

	const R = smooth( rings, steps );
	const pos = [], uv = [], idx = [];
	const a0 = arc ? arc[ 0 ] : 0, a1 = arc ? arc[ 1 ] : Math.PI * 2;
	const closed = ! arc;
	const cols = closed ? seg : seg + 1;
	for ( let i = 0; i < R.length; i ++ ) {

		const r = R[ i ];
		const pa = R[ Math.max( 0, i - 1 ) ].p, pb = R[ Math.min( R.length - 1, i + 1 ) ].p;
		_t.set( pb[ 0 ] - pa[ 0 ], pb[ 1 ] - pa[ 1 ], pb[ 2 ] - pa[ 2 ] ).normalize();
		if ( side ) {

			// a given side axis, made square to the spine (a stable frame for near-vertical spines)
			_s.copy( side ).addScaledVector( _t, - side.dot( _t ) );

		} else {

			_s.crossVectors( _t, WORLD_UP );
			if ( _s.lengthSq() < 1e-6 ) _s.set( 0, 0, 1 );

		}

		_s.normalize();
		_u.crossVectors( _s, _t ).normalize();
		for ( let j = 0; j < cols; j ++ ) {

			const a = a0 + ( a1 - a0 ) * j / seg;
			const [ x, y ] = section( r, a );
			pos.push( r.p[ 0 ] + _s.x * x + _u.x * y, r.p[ 1 ] + _s.y * x + _u.y * y, r.p[ 2 ] + _s.z * x + _u.z * y );
			uv.push( j / seg, i / ( R.length - 1 ) );

		}

	}

	for ( let i = 0; i < R.length - 1; i ++ ) {

		for ( let j = 0; j < seg; j ++ ) {

			const j1 = closed ? ( j + 1 ) % cols : j + 1;
			const a = i * cols + j, b = i * cols + j1, c = ( i + 1 ) * cols + j1, d = ( i + 1 ) * cols + j;
			idx.push( a, d, b, b, d, c );

		}

	}

	// caps: a fan to the end centre
	const addCap = ( i, flip ) => {

		const r = R[ i ];
		const ci = pos.length / 3;
		pos.push( ...r.p );
		uv.push( 0.5, i ? 1 : 0 );
		for ( let j = 0; j < seg; j ++ ) {

			const j1 = closed ? ( j + 1 ) % cols : j + 1;
			const a = i * cols + j, b = i * cols + j1;
			if ( flip ) idx.push( ci, b, a ); else idx.push( ci, a, b );

		}

	};

	if ( closed && cap[ 0 ] ) addCap( 0, false );
	if ( closed && cap[ 1 ] ) addCap( R.length - 1, true );

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uv, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	g.computeBoundingSphere();
	return g;

}

// a tapered tube through points (limbs, tails): radii per point, optional flattening
export function tube( points, radii, { seg = 12, steps = 4, flat = 1, n = 2, side = null, cap = [ true, true ] } = {} ) {

	return loft( points.map( ( p, i ) => ( { p, w: radii[ i ] * flat, up: radii[ i ], down: radii[ i ], n } ) ), { seg, steps, side, cap } );

}
