import { Group, InstancedMesh, CylinderGeometry, IcosahedronGeometry, ConeGeometry, Matrix4, Vector3, Quaternion, Euler, Color } from '../engine/index.js';
import { Material } from '../engine/webgpu.js';
import { Build, KIND } from './Build.js';
import { surfacesModule } from './Materials.js';
import { heightAt, fbm, CASTLE } from './Terrain.js';
import { rng } from '../game/Rng.js';

// Woods and copses round the tournament ground: oaks, beeches and spruces, each a few instanced
// variants built from a tapering trunk, boughs and lumpy clusters of leaves. Near trees are the full
// model; beyond LOD_R a cheaper one. Crowns sway with the wind, leaves flutter.

const LOD_R = 230;
const _v = new Vector3();

let _treeMat = null;
export function treeMaterial() {

	return _treeMat || ( _treeMat = new Material( {
		name: 'tree', vertexColors: true, roughness: 0.85, modules: [ surfacesModule ],
		vertex: /* wgsl */`
			let ph = v.model[ 3 ].x * 0.31 + v.model[ 3 ].z * 0.17;
			let h = max( v.position.y - 1.5, 0.0 );
			let gust = 0.6 + 0.4 * sin( frame.time * 0.35 + ph * 0.2 );
			v.position.x += sin( frame.time * 1.1 + ph ) * 0.012 * h * gust;
			v.position.z += sin( frame.time * 0.9 + ph * 1.3 ) * 0.008 * h * gust;
			if ( surfaceKind( v.color.a ) == 9 ) {
				let q = v.position * 3.0;
				v.position += vec3f( sin( frame.time * 4.1 + q.y + q.z ), sin( frame.time * 3.3 + q.x ), sin( frame.time * 3.7 + q.x + q.y ) ) * 0.025 * gust;
			}
		`,
		surface: 'worldSurface( in, s );',
	} ) );

}

// displace a leaf cluster into an irregular lump (non-indexed: equal positions move equally)
function lumpy( g, cx, cy, cz, amount, seed ) {

	const p = g.attributes.position.array;
	for ( let i = 0; i < p.length; i += 3 ) {

		const x = p[ i ], y = p[ i + 1 ], z = p[ i + 2 ];
		const k = 1 + fbm( x * 1.3 + seed, z * 1.3 + y * 0.7 - seed, 3 ) * amount;
		p[ i ] = cx + ( x - cx ) * k; p[ i + 1 ] = cy + ( y - cy ) * k; p[ i + 2 ] = cz + ( z - cz ) * k;

	}


}

function trunk( b, R, h, r0, lean = 0.05 ) {

	b.add( new CylinderGeometry( r0 * 0.6, r0, h, 9, 3 ), 0x4a3a2c, { k: KIND.bark, p: [ 0, h / 2, 0 ], r: [ ( R() - 0.5 ) * lean, 0, ( R() - 0.5 ) * lean ] } );
	// root flare
	b.add( new ConeGeometry( r0 * 1.8, r0 * 2.2, 9, 1, true ), 0x3e3024, { k: KIND.bark, p: [ 0, r0 * 1.0, 0 ] } );

}

function bough( b, R, y, len, r, ang, tilt ) {

	const g = new CylinderGeometry( r * 0.4, r, len, 6 );
	g.translate( 0, len / 2, 0 );
	b.add( g, 0x4a3a2c, { k: KIND.bark, p: [ 0, y, 0 ], r: [ 0, ang, tilt ] } );
	return [ Math.cos( ang ) * Math.sin( tilt ) * - len, y + Math.cos( tilt ) * len, Math.sin( ang ) * Math.sin( tilt ) * len ];

}

function leaves( b, R, c, x, y, z, s, detail, color ) {

	const g = b.add( new IcosahedronGeometry( 1, detail ), color, { k: KIND.foliage, p: [ x, y, z ], s: [ s * ( 0.9 + R() * 0.3 ), s * ( 0.75 + R() * 0.2 ), s * ( 0.9 + R() * 0.3 ) ], r: [ R() * 3, R() * 3, R() * 3 ] } );
	lumpy( g, x, y, z, 0.55, R() * 50 );

}

// a broadleaf (oak or beech): trunk, a few boughs, a crown of leaf clusters round their ends
function broadleaf( seed, { tall = false, far = false } = {} ) {

	const R = rng( seed ), b = new Build();
	const H = tall ? 7.5 : 5.2, crownR = tall ? 3.2 : 4.2;
	trunk( b, R, H, tall ? 0.28 : 0.4 );
	const green = tall ? 0x3d5426 : 0x344c20;
	if ( far ) {

		leaves( b, R, 0, 0, H + crownR * 0.5, 0, crownR * 1.15, 1, green );
		leaves( b, R, 0, crownR * 0.4, H + crownR * 0.1, crownR * 0.2, crownR * 0.8, 1, green );
		return b.geometry();

	}

	const ends = [];
	const n = tall ? 4 : 5;
	for ( let i = 0; i < n; i ++ ) {

		const a = i / n * Math.PI * 2 + R() * 0.6;
		ends.push( bough( b, R, H * ( 0.6 + R() * 0.25 ), crownR * ( 0.6 + R() * 0.3 ), tall ? 0.1 : 0.14, a, 0.6 + R() * 0.4 ) );

	}

	// clusters: round the bough ends, on top, and a few filling the middle
	for ( const [ x, y, z ] of ends ) leaves( b, R, 0, x, y + 0.3, z, crownR * ( 0.45 + R() * 0.15 ), 1, green );
	for ( let i = 0; i < ( tall ? 7 : 9 ); i ++ ) {

		const a = R() * Math.PI * 2, rr = crownR * ( 0.2 + R() * 0.55 );
		const y = H + crownR * ( tall ? 0.2 + R() * 1.3 : 0.1 + R() * 0.8 );
		leaves( b, R, 0, Math.cos( a ) * rr, y, Math.sin( a ) * rr, crownR * ( 0.38 + R() * 0.2 ), 1, green );

	}

	leaves( b, R, 0, 0, H + crownR * ( tall ? 1.4 : 0.95 ), 0, crownR * 0.5, 1, green );
	return b.geometry();

}

// a spruce: a straight stem and tiers of drooping, jagged boughs narrowing to the top
function spruce( seed, { far = false } = {} ) {

	const R = rng( seed ), b = new Build();
	const H = 11 + R() * 3;
	b.add( new CylinderGeometry( 0.06, 0.32, H, 8 ), 0x3e3026, { k: KIND.bark, p: [ 0, H / 2, 0 ] } );
	const tiers = far ? 4 : 9;
	for ( let i = 0; i < tiers; i ++ ) {

		const t = i / tiers;
		const r = 2.9 * ( 1 - t ) + 0.35, h = H / tiers * 1.9;
		const g = b.add( new ConeGeometry( r, h, far ? 7 : 11, 2 ), 0x1e3319, { k: KIND.foliage, p: [ 0, 1.6 + t * ( H - 1.6 ) + h * 0.35, 0 ], r: [ 0, R() * 3, 0 ] } );
		if ( ! far ) lumpy( g, 0, 1.6 + t * ( H - 1.6 ) + h * 0.35, 0, 0.35, i * 7 + seed );

	}

	return b.geometry();

}

export class Nature {

	constructor() {

		this.group = new Group();
		const R = rng( 21 );
		const kinds = [
			{ near: [ broadleaf( 1 ), broadleaf( 2 ) ], far: broadleaf( 3, { far: true } ), w: 0.5, tint: [ 0xffffff, 0xe8f0d8, 0xf4ecd0 ] },
			{ near: [ broadleaf( 4, { tall: true } ) ], far: broadleaf( 5, { tall: true, far: true } ), w: 0.25, tint: [ 0xffffff, 0xf0f4e0 ] },
			{ near: [ spruce( 6 ), spruce( 7 ) ], far: spruce( 8, { far: true } ), w: 0.25, tint: [ 0xffffff, 0xe0e8e0 ] },
		];

		// placements: copses where the woodland noise is high, scattered trees elsewhere
		const spots = [];
		for ( let i = 0; i < 9000 && spots.length < 1100; i ++ ) {

			const a = R() * Math.PI * 2, d = 88 + Math.pow( R(), 0.8 ) * 520;
			const x = Math.cos( a ) * d, z = Math.sin( a ) * d;
			if ( Math.hypot( x - CASTLE.x, z - CASTLE.z ) < CASTLE.r + 8 ) continue;
			if ( z < - 90 && Math.abs( x - 60 + ( z + 160 ) * 0.14 ) < 12 ) continue; // the road to the gate
			if ( Math.abs( z ) < 30 && Math.abs( x ) < 95 ) continue; // the lists and the pavilions
			const wood = fbm( x * 0.012, z * 0.012, 3 );
			if ( R() > ( wood > 0.08 ? 0.9 : 0.06 ) ) continue;
			spots.push( [ x, z, d ] );

		}

		const m = new Matrix4(), q = new Quaternion(), e = new Euler(), s = new Vector3(), c = new Color();
		const pick = spots.map( () => {

			let t = R();
			return kinds.findIndex( ( k ) => ( t -= k.w ) < 0 );

		} );
		kinds.forEach( ( k, ki ) => {

			const lists = { far: [] };
			k.near.forEach( ( _, i ) => ( lists[ i ] = [] ) );
			spots.forEach( ( sp, i ) => {

				if ( pick[ i ] !== ki ) return;
				( sp[ 2 ] > LOD_R ? lists.far : lists[ Math.floor( R() * k.near.length ) ] ).push( sp );

			} );

			const make = ( geo, list ) => {

				if ( ! list.length ) return;
				const im = new InstancedMesh( geo, treeMaterial(), list.length );
				list.forEach( ( [ x, z ], i ) => {

					const sc = 0.8 + R() * 0.5;
					m.compose( _v.set( x, heightAt( x, z ) - 0.15, z ), q.setFromEuler( e.set( 0, R() * Math.PI * 2, 0 ) ), s.set( sc, sc * ( 0.9 + R() * 0.25 ), sc ) );
					im.setMatrixAt( i, m );
					im.setColorAt( i, c.set( k.tint[ Math.floor( R() * k.tint.length ) ] ) );

				} );
				im.castShadow = true;
				im.receiveShadow = true;
				im.frustumCulled = false;
				this.group.add( im );

			};

			k.near.forEach( ( g, i ) => make( g, lists[ i ] ) );
			make( k.far, lists.far );

		} );

		this.count = spots.length;

	}

}
