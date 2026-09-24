import { InstancedMesh, CylinderGeometry, SphereGeometry, ConeGeometry, Matrix4, Vector3, Quaternion, Euler } from '../engine/index.js';
import { Material } from '../engine/webgpu.js';
import { Build } from './Build.js';
import { rng } from '../game/Rng.js';

// The spectators: one instanced figure, dressed differently per instance by the shader. Each
// vertex carries its part in the colour (r = part / 16, g = 1 on the arms, b = distance down the
// arm), so a townsman in a hood and hose and a lady in a long gown and veil are the same mesh:
// the parts a person does not wear fold away to nothing.
//
// Parts: 0 tunic, 1 hose, 2 skin, 3 hair, 4 hood, 5 hat, 6 veil, 7 gown, 8 shoes, 9 belt.

const PART = { tunic: 0, hose: 1, skin: 2, hair: 3, hood: 4, hat: 5, veil: 6, gown: 7, shoes: 8, belt: 9 };

function tag( g, part, arm = 0, pivotY = 1.42, len = 0.62 ) {

	const c = g.attributes.color.array, p = g.attributes.position.array;
	for ( let i = 0, j = 0; i < c.length; i += 4, j += 3 ) {

		c[ i ] = ( part + 0.5 ) / 16;
		c[ i + 1 ] = arm;
		c[ i + 2 ] = arm ? Math.min( 1, Math.max( 0, ( pivotY - p[ j + 1 ] ) / len ) ) : 0;
		c[ i + 3 ] = 1;

	}

}

function personGeometry() {

	const b = new Build();
	const add = ( geo, part, o, arm = 0 ) => tag( b.add( geo, 0xffffff, o ), part, arm );
	// legs in hose, and shoes
	for ( const x of [ - 0.09, 0.09 ] ) {

		add( new CylinderGeometry( 0.065, 0.05, 0.8, 5 ), PART.hose, { p: [ x, 0.44, 0 ] } );
		add( new SphereGeometry( 0.06, 5, 3 ), PART.shoes, { p: [ x, 0.04, 0.04 ], s: [ 0.9, 0.55, 1.6 ] } );

	}

	// the tunic: chest to mid-thigh, belted; and a gown to the ground (one or the other shows)
	add( new CylinderGeometry( 0.2, 0.15, 0.5, 8 ), PART.tunic, { p: [ 0, 1.2, 0 ], s: [ 1, 1, 0.72 ] } );
	add( new CylinderGeometry( 0.15, 0.23, 0.42, 8 ), PART.tunic, { p: [ 0, 0.76, 0 ], s: [ 1, 1, 0.8 ] } );
	add( new CylinderGeometry( 0.155, 0.155, 0.05, 8 ), PART.belt, { p: [ 0, 0.96, 0 ], s: [ 1, 1, 0.8 ] } );
	add( new CylinderGeometry( 0.18, 0.14, 0.52, 8 ), PART.gown, { p: [ 0, 1.2, 0 ], s: [ 1, 1, 0.72 ] } );
	add( new CylinderGeometry( 0.14, 0.3, 0.96, 9 ), PART.gown, { p: [ 0, 0.47, 0 ], s: [ 1, 1, 0.85 ] } );
	// shoulders and neck
	add( new SphereGeometry( 0.2, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2 ), PART.tunic, { p: [ 0, 1.43, 0 ], s: [ 1, 0.45, 0.72 ] } );
	add( new CylinderGeometry( 0.05, 0.055, 0.1, 5 ), PART.skin, { p: [ 0, 1.5, 0 ] } );
	// arms (hanging from the shoulder pivot) with hands
	for ( const x of [ - 1, 1 ] ) {

		add( new CylinderGeometry( 0.055, 0.045, 0.56, 5 ), PART.tunic, { p: [ x * 0.23, 1.14, 0 ] }, 1 );
		add( new SphereGeometry( 0.045, 5, 3 ), PART.skin, { p: [ x * 0.23, 0.83, 0 ], s: [ 0.8, 1.2, 0.9 ] }, 1 );

	}

	// the head: face and skull, nose, hair
	add( new SphereGeometry( 0.105, 8, 6 ), PART.skin, { p: [ 0, 1.64, 0.005 ], s: [ 0.9, 1.12, 1 ] } );
	add( new ConeGeometry( 0.02, 0.05, 4 ), PART.skin, { p: [ 0, 1.63, 0.105 ], r: [ Math.PI / 2 + 0.3, 0, 0 ] } );
	add( new SphereGeometry( 0.11, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.55 ), PART.hair, { p: [ 0, 1.66, - 0.01 ], s: [ 0.95, 1.1, 1.05 ] } );
	// headwear: a hood with its liripipe-less capelet, a brimmed hat, a veil
	add( new SphereGeometry( 0.13, 7, 4, Math.PI * 0.8, Math.PI * 1.4, 0, Math.PI * 0.62 ), PART.hood, { p: [ 0, 1.66, - 0.01 ], s: [ 1, 1.08, 1.05 ], r: [ 0, Math.PI, 0 ] } );
	add( new ConeGeometry( 0.26, 0.2, 8, 1, true ), PART.hood, { p: [ 0, 1.44, 0 ], s: [ 1, 1, 0.8 ] } );
	add( new CylinderGeometry( 0.2, 0.2, 0.02, 9 ), PART.hat, { p: [ 0, 1.74, 0 ] } );
	add( new CylinderGeometry( 0.085, 0.1, 0.12, 7 ), PART.hat, { p: [ 0, 1.8, 0 ] } );
	add( new SphereGeometry( 0.125, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.62 ), PART.veil, { p: [ 0, 1.66, - 0.01 ], s: [ 1, 1.1, 1.05 ] } );
	add( new CylinderGeometry( 0.12, 0.2, 0.3, 8, 1, true, Math.PI * 0.75, Math.PI * 1.5 ), PART.veil, { p: [ 0, 1.52, - 0.02 ], r: [ 0, Math.PI, 0 ] } );
	return b.geometry();

}

export function crowdMaterial() {

	return new Material( {
		name: 'crowd', vertexColors: true, roughness: 0.9,
		uniforms: { excite: [ 'f32', 0.2 ] },
		varyings: { vPart: 'f32', vSeed: 'f32' },
		vertex: /* wgsl */`
			let id = f32( v.instance );
			let seed = fract( sin( id * 12.9898 + 1.7 ) * 43758.5453 );
			let part = i32( floor( v.color.r * 16.0 ) );
			let lady = seed < 0.38;
			let wear = fract( seed * 7.13 ); // headwear
			// fold away what this person does not wear (to the middle of the chest, out of sight)
			var hide = false;
			if ( part == 0 || part == 9 ) { hide = lady; }
			if ( part == 7 ) { hide = ! lady; }
			if ( part == 6 ) { hide = ! lady || wear > 0.7; }
			if ( part == 4 ) { hide = lady || wear > 0.45; }
			if ( part == 5 ) { hide = lady || wear < 0.45 || wear > 0.72; }
			if ( hide ) { v.position = vec3f( 0.0, 1.1, 0.0 ); }
			// cheering: jump, and the arms swing up from the shoulders and wave
			let rate = 7.0 + seed * 5.0;
			let jump = max( 0.0, sin( frame.time * rate + seed * 6.28 ) );
			let idle = sin( frame.time * ( 1.0 + seed ) + seed * 20.0 ) * 0.015;
			v.worldOffset.y = jump * jump * mat.excite * 0.3 + idle;
			if ( v.color.g > 0.5 ) {
				let side = sign( v.position.x );
				let raise = clamp( mat.excite * 1.5 + jump * 0.25 - 0.35 + fract( seed * 3.7 ) * 0.4, 0.0, 1.0 );
				let a = side * ( raise * 2.7 + sin( frame.time * rate * 0.5 + seed * 9.0 ) * 0.25 * raise ) + side * 0.06;
				let pv = vec3f( side * 0.23, 1.42, 0.0 );
				let q = v.position - pv;
				let ca = cos( a ); let sa = sin( a );
				v.position = pv + vec3f( ca * q.x - sa * q.y, sa * q.x + ca * q.y, q.z );
			}
			o.vPart = f32( part ) + 0.5;
			o.vSeed = seed;
		`,
		surface: /* wgsl */`
			s.alpha = 1.0;
			let part = i32( in.vs.vPart );
			let seed = in.vs.vSeed;
			let h1 = fract( seed * 17.31 ); let h2 = fract( seed * 5.77 + 0.3 ); let h3 = fract( seed * 29.1 + 0.7 );
			// dyed wool and linen: madder, woad, weld, walnut, undyed, and the rich in scarlet
			var dyes = array<vec3f, 10>(
				vec3f( 0.33, 0.05, 0.04 ), vec3f( 0.06, 0.1, 0.24 ), vec3f( 0.12, 0.17, 0.07 ), vec3f( 0.3, 0.22, 0.07 ),
				vec3f( 0.16, 0.1, 0.06 ), vec3f( 0.4, 0.36, 0.28 ), vec3f( 0.09, 0.08, 0.08 ), vec3f( 0.23, 0.08, 0.16 ),
				vec3f( 0.5, 0.06, 0.04 ), vec3f( 0.2, 0.19, 0.17 ) );
			var skins = array<vec3f, 5>( vec3f( 0.62, 0.42, 0.33 ), vec3f( 0.55, 0.36, 0.26 ), vec3f( 0.44, 0.27, 0.18 ), vec3f( 0.3, 0.18, 0.11 ), vec3f( 0.66, 0.47, 0.38 ) );
			var hairs = array<vec3f, 5>( vec3f( 0.05, 0.035, 0.025 ), vec3f( 0.14, 0.08, 0.04 ), vec3f( 0.3, 0.2, 0.09 ), vec3f( 0.22, 0.07, 0.03 ), vec3f( 0.4, 0.38, 0.34 ) );
			var c = dyes[ u32( h1 * 10.0 ) % 10u ];
			var rough = 0.92;
			if ( part == 1 ) { c = dyes[ u32( h2 * 10.0 ) % 10u ] * 0.8; }
			if ( part == 2 ) { c = skins[ u32( h3 * 5.0 ) % 5u ]; rough = 0.6; s.translucency = c * 0.12; }
			if ( part == 3 ) { c = hairs[ u32( h2 * 5.0 ) % 5u ]; rough = 0.7; }
			if ( part == 4 || part == 5 ) { c = dyes[ u32( h3 * 10.0 ) % 10u ]; }
			if ( part == 6 ) { c = vec3f( 0.42, 0.4, 0.34 ) * ( 0.8 + 0.4 * h2 ); s.translucency = c * 0.15; }
			if ( part == 8 ) { c = vec3f( 0.06, 0.04, 0.03 ); rough = 0.6; }
			if ( part == 9 ) { c = vec3f( 0.08, 0.05, 0.03 ); rough = 0.6; }
			// a weave and some wear
			c *= 0.85 + 0.25 * fract( sin( dot( floor( in.P * 40.0 ), vec3f( 12.9, 78.2, 37.7 ) ) ) * 43758.5 ) * select( 1.0, 0.0, part == 2 );
			s.albedo = c;
			s.roughness = rough;
			s.sheenColor = c * 0.5;
			s.sheenRoughness = 0.6;
		`,
	} );

}

// spots: [ x, y, z, facing sign ] (facing +z when the sign is -1)
export function buildCrowd( spots, material ) {

	const R = rng( 99 );
	const n = spots.length;
	const mesh = new InstancedMesh( personGeometry(), material, n );
	const m = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3();
	for ( let i = 0; i < n; i ++ ) {

		const [ x, y, z, sz ] = spots[ i ];
		p.set( x, y, z );
		q.setFromEuler( e.set( 0, ( sz > 0 ? Math.PI : 0 ) + ( R() - 0.5 ) * 0.7, 0 ) );
		const k = 0.92 + R() * 0.14;
		m.compose( p, q, s.set( k * ( 0.95 + R() * 0.12 ), k, k ) );
		mesh.setMatrixAt( i, m );

	}

	mesh.frustumCulled = false;
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;

}
