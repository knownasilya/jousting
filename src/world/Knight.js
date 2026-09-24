import { Group, Mesh, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, TorusGeometry, BufferGeometry, Float32BufferAttribute, Vector3, Quaternion, Matrix4, Color } from '../engine/index.js';
import { Material } from '../engine/webgpu.js';
import { heraldryAtlas, ATLAS_SLOTS } from './Materials.js';
import { HORSES, ARMOURS, PLUMES, SKINS, HAIRS } from '../game/Options.js';

// A mounted knight, built from primitives: horse with caparison, rider in plate with a surcoat,
// five helm styles, a heater shield and a lance. The model faces +x; `group` is placed on the ground.
//
// Each knight has its own materials (colours are uniforms, arms come from the heraldry atlas), so
// changing an option only changes uniform values and visibility: no new pipelines at run time.

const Y = new Vector3( 0, 1, 0 );
const _v = new Vector3(), _q = new Quaternion(), _m = new Matrix4();

// seat of the rider above the ground, and the lance grip / zones used by the joust
export const SEAT_Y = 1.8;

let _shared = null;
function shared() {

	if ( _shared ) return _shared;
	_shared = {
		leather: new Material( { name: 'leather', color: 0x4a2c18, roughness: 0.7 } ),
		dark: new Material( { name: 'dark', color: 0x0e0c0b, roughness: 0.6 } ),
		gold: new Material( { name: 'goldTrim', color: 0xe0b04a, metalness: 1, roughness: 0.3 } ),
		white: new Material( { name: 'white', color: 0xeeeae2, roughness: 0.6 } ),
		mail: new Material( { name: 'mail', color: 0x5a5c62, metalness: 0.9, roughness: 0.55,
			surface: 's.roughness = 0.45 + 0.25 * step( 0.5, fract( in.uv.x * 90.0 + step( 0.5, fract( in.uv.y * 40.0 ) ) * 0.5 ) );' } ),
		wood: new Material( { name: 'lanceWood', color: 0x8a6440, roughness: 0.6 } ),
	};
	return _shared;

}

// a cylinder from a to b (radius r0 at a, r1 at b)
function limbGeo( a, b, r0, r1 = r0, seg = 10 ) {

	const d = _v.subVectors( b, a );
	const len = d.length();
	const g = new CylinderGeometry( r1, r0, len, seg );
	g.translate( 0, len / 2, 0 );
	_q.setFromUnitVectors( Y, d.normalize() );
	g.applyMatrix4( _m.makeRotationFromQuaternion( _q ) );
	g.translate( a.x, a.y, a.z );
	return g;

}

const V = ( x, y, z ) => new Vector3( x, y, z );

function mesh( geo, mat, parent, { p, r, s, shadow = true } = {} ) {

	const m = new Mesh( geo, mat );
	if ( p ) m.position.set( ...p );
	if ( r ) m.rotation.set( ...r );
	if ( s ) typeof s === 'number' ? m.scale.setScalar( s ) : m.scale.set( ...s );
	m.castShadow = shadow;
	m.receiveShadow = true;
	parent.add( m );
	return m;

}

// the heater shield: a slightly curved plate with a rim, facing +z, 0.52 x 0.64 m
function shieldGeometry() {

	const W = 0.26, TOP = 0.3, BOT = - 0.34, N = 14;
	const outline = [];
	outline.push( [ - W, TOP ], [ W, TOP ] );
	for ( let i = 1; i <= N; i ++ ) {

		const t = i / N;
		const y = TOP - 0.16 - t * ( TOP - 0.16 - BOT );
		const x = W * Math.sqrt( Math.max( 0, 1 - Math.pow( t, 1.6 ) ) );
		outline.push( [ x, y ] );

	}

	for ( let i = N - 1; i >= 1; i -- ) {

		const [ x, y ] = outline[ i + 1 ];
		outline.push( [ - x, y ] );

	}

	const bend = ( x ) => - x * x * 0.9;
	const pos = [], nrm = [], uv = [];
	const cx = 0, cy = 0.02;
	const add = ( x, y, z, nx, ny, nz ) => {

		pos.push( x, y, z ); nrm.push( nx, ny, nz );
		uv.push( ( x + W ) / ( 2 * W ), ( y - BOT ) / ( TOP - BOT ) );

	};

	const n = outline.length;
	for ( let i = 0; i < n; i ++ ) {

		const [ x0, y0 ] = outline[ i ], [ x1, y1 ] = outline[ ( i + 1 ) % n ];
		// front (+z) fan, with a normal that follows the bend
		const nf = ( x ) => { const l = Math.hypot( 1.8 * x, 1 ); return [ 1.8 * x / l, 0, 1 / l ]; };
		add( cx, cy, bend( cx ), ...nf( cx ) ); add( x0, y0, bend( x0 ), ...nf( x0 ) ); add( x1, y1, bend( x1 ), ...nf( x1 ) );
		// back
		const T = - 0.03;
		add( cx, cy, bend( cx ) + T, 0, 0, - 1 ); add( x1, y1, bend( x1 ) + T, 0, 0, - 1 ); add( x0, y0, bend( x0 ) + T, 0, 0, - 1 );
		// rim
		const ex = y1 - y0, ey = - ( x1 - x0 ), el = Math.hypot( ex, ey );
		const [ rx, ry ] = [ ex / el, ey / el ];
		add( x0, y0, bend( x0 ), rx, ry, 0 ); add( x0, y0, bend( x0 ) + T, rx, ry, 0 ); add( x1, y1, bend( x1 ), rx, ry, 0 );
		add( x1, y1, bend( x1 ), rx, ry, 0 ); add( x0, y0, bend( x0 ) + T, rx, ry, 0 ); add( x1, y1, bend( x1 ) + T, rx, ry, 0 );

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new Float32BufferAttribute( nrm, 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uv, 2 ) );
	g.computeBoundingSphere();
	return g;

}

export class Knight {

	constructor( options, slot ) {

		this.slot = slot;
		this.group = new Group();
		this.phase = 0;
		this.speed = 0;
		this.gait = 0; // 0 stand .. 1 full gallop (smoothed)
		this.lanceBroken = false;
		this.fallen = null;
		this.victory = 0;
		this.helmOff = false;
		this.lanceAim = null; // world point the lance points at (null = raised)
		this.lanceLower = 0; // 0 raised .. 1 couched (smoothed)
		this.shieldBrace = 0;
		this.recoil = 0; // 0..1 after being struck

		this.makeMaterials();
		this.buildHorse();
		this.buildRider();
		this.buildLance();
		this.apply( options );

	}

	makeMaterials() {

		const cloth = ( name, extraVertex = '' ) => new Material( {
			name, roughness: 0.85, side: 'double',
			textures: { heraldry: heraldryAtlas },
			uniforms: { slot: [ 'f32', this.slot ], speed: [ 'f32', 0 ] },
			vertex: extraVertex,
			surface: /* wgsl */`
				let u = ( mat.slot + 0.02 + fract( in.uv.x ) * 0.96 ) / ${ ATLAS_SLOTS.toFixed( 1 ) };
				let t = textureSample( heraldry, smpLinearClamp, vec2f( u, clamp( 1.0 - in.uv.y, 0.0, 1.0 ) ) );
				s.albedo = t.rgb;
			`,
		} );
		this.mats = {
			armour: new Material( { name: 'armour', color: 0xcccccc, metalness: 1, roughness: 0.25 } ),
			// caparison: the skirt streams back and ripples with speed (uv.y = 0 at the hem)
			cloth: cloth( 'caparison', /* wgsl */`
				let hem = 1.0 - v.uv.y;
				let sp = mat.speed;
				v.position.x -= hem * hem * sp * 0.3;
				v.position.y += hem * hem * sp * 0.08;
				let r = sin( frame.time * ( 4.0 + sp * 9.0 ) + v.uv.x * 40.0 ) * ( 0.012 + 0.03 * sp ) * hem;
				v.position += v.normal * r;
			` ),
			surcoat: cloth( 'surcoat' ),
			shield: new Material( {
				name: 'shield', roughness: 0.45,
				textures: { heraldry: heraldryAtlas },
				uniforms: { slot: [ 'f32', this.slot ] },
				surface: /* wgsl */`
					let u = ( mat.slot + 0.02 + in.uv.x * 0.96 ) / ${ ATLAS_SLOTS.toFixed( 1 ) };
					let t = textureSample( heraldry, smpLinearClamp, vec2f( u, 1.0 - in.uv.y ) );
					// worn paint: a little darker toward the rim
					let e = min( min( in.uv.x, 1.0 - in.uv.x ), min( in.uv.y, 1.0 - in.uv.y ) );
					s.albedo = t.rgb * ( 0.8 + 0.2 * smoothstep( 0.0, 0.12, e ) );
				`,
			} ),
			coat: new Material( {
				name: 'coat', roughness: 0.5, uniforms: { dapple: [ 'f32', 0 ] },
				surface: /* wgsl */`
					let n = mx_noise_float3( in.P * 9.0 ) * 0.5 + 0.5;
					let spots = smoothstep( 0.45, 0.62, n );
					s.albedo = s.albedo * mix( 1.0, 0.7 + 0.6 * spots, mat.dapple );
					s.sheenColor = s.albedo * 0.6;
					s.sheenRoughness = 0.5;
				`,
			} ),
			mane: new Material( { name: 'mane', roughness: 0.75 } ),
			socks: new Material( { name: 'socks', roughness: 0.6 } ),
			skin: new Material( { name: 'skin', roughness: 0.55 } ),
			hair: new Material( { name: 'hair', roughness: 0.8 } ),
			plume: new Material( { name: 'plume', roughness: 0.9 } ),
			lance: new Material( {
				name: 'lance', roughness: 0.5,
				uniforms: { c1: [ 'vec3f', new Color( 1, 1, 1 ) ], c2: [ 'vec3f', new Color( 1, 0, 0 ) ] },
				surface: /* wgsl */`
					let k = step( 0.5, fract( in.uv.y * 14.0 + in.uv.x ) );
					s.albedo = mix( mat.c1, mat.c2, k );
				`,
			} ),
		};

	}

	// ------------------------------------------------------------------------------ horse

	buildHorse() {

		const M = this.mats, S = shared();
		const horse = new Group();
		this.group.add( horse );
		this.horse = horse;
		const body = new Group(); // bobs with the gait
		horse.add( body );
		this.body = body;

		mesh( new SphereGeometry( 1, 20, 14 ), M.coat, body, { p: [ 0, 1.32, 0 ], s: [ 0.95, 0.42, 0.36 ] } );
		mesh( new SphereGeometry( 1, 16, 12 ), M.coat, body, { p: [ 0.52, 1.36, 0 ], s: [ 0.44, 0.44, 0.34 ] } );
		mesh( new SphereGeometry( 1, 16, 12 ), M.coat, body, { p: [ - 0.56, 1.37, 0 ], s: [ 0.45, 0.43, 0.37 ] } );

		// neck and head
		const neck = new Group();
		neck.position.set( 0.7, 1.5, 0 );
		body.add( neck );
		this.neck = neck;
		mesh( limbGeo( V( 0, 0, 0 ), V( 0.38, 0.56, 0 ), 0.27, 0.15, 14 ), M.coat, neck );
		mesh( limbGeo( V( - 0.02, 0.2, 0 ), V( 0.33, 0.68, 0 ), 0.06, 0.04, 6 ), M.mane, neck, { s: [ 1, 1, 0.6 ] } ); // mane
		const head = new Group();
		head.position.set( 0.38, 0.58, 0 );
		neck.add( head );
		this.head = head;
		const dir = V( 0.62, - 0.78, 0 );
		mesh( limbGeo( V( - 0.04, 0.05, 0 ), dir.clone().multiplyScalar( 0.58 ), 0.12, 0.085, 12 ), M.coat, head, { s: [ 1, 1, 0.85 ] } );
		mesh( new SphereGeometry( 0.1, 10, 8 ), M.coat, head, { p: [ 0.37, - 0.45, 0 ], s: [ 1, 0.9, 0.8 ] } ); // muzzle
		this.blaze = mesh( limbGeo( V( 0.08, 0.02, 0 ), V( 0.36, - 0.36, 0 ), 0.03, 0.02, 6 ), S.white, head, { p: [ 0.02, 0, 0 ], s: [ 1, 1, 0.3 ], shadow: false } );
		for ( const z of [ - 1, 1 ] ) {

			mesh( new ConeGeometry( 0.035, 0.14, 6 ), M.coat, head, { p: [ - 0.04, 0.16, z * 0.06 ], r: [ z * 0.2, 0, 0.2 ] } );
			mesh( new SphereGeometry( 0.022, 8, 6 ), S.dark, head, { p: [ 0.1, - 0.04, z * 0.085 ], shadow: false } );

		}

		// chanfron (face armour) and bridle
		this.chanfron = mesh( limbGeo( V( 0.02, 0.1, 0 ), V( 0.3, - 0.3, 0 ), 0.1, 0.075, 8, ), M.armour, head, { p: [ 0.03, 0, 0 ], s: [ 1, 1, 0.9 ] } );
		mesh( new ConeGeometry( 0.02, 0.18, 6 ), M.armour, head, { p: [ 0.12, 0.02, 0 ], r: [ 0, 0, - 0.9 ] } ); // spike
		mesh( new TorusGeometry( 0.1, 0.012, 6, 14 ), S.leather, head, { p: [ 0.3, - 0.36, 0 ], r: [ 0, Math.PI / 2, 0.7 ], shadow: false } );
		// reins to the rider's hands
		mesh( limbGeo( V( 0.68, 1.66, 0 ), V( 1.35, 1.72, 0 ), 0.012, 0.012, 4 ), S.leather, body, { shadow: false } );

		// legs: hip pivot -> upper leg -> knee pivot -> cannon (sock colour) -> hoof
		this.legs = [];
		const legDefs = [
			{ x: 0.55, z: 0.17, front: true }, { x: 0.55, z: - 0.17, front: true },
			{ x: - 0.62, z: 0.19, front: false }, { x: - 0.62, z: - 0.19, front: false },
		];
		for ( const d of legDefs ) {

			const hip = new Group();
			hip.position.set( d.x, 1.2, d.z );
			body.add( hip );
			mesh( limbGeo( V( 0, 0.1, 0 ), V( 0, - 0.5, 0 ), d.front ? 0.12 : 0.15, 0.07, 10 ), M.coat, hip );
			const knee = new Group();
			knee.position.set( 0, - 0.5, 0 );
			hip.add( knee );
			mesh( limbGeo( V( 0, 0.02, 0 ), V( 0, - 0.5, 0 ), 0.065, 0.05, 8 ), M.socks, knee );
			mesh( new CylinderGeometry( 0.06, 0.075, 0.1, 10 ), S.dark, knee, { p: [ 0.01, - 0.55, 0 ] } );
			this.legs.push( { hip, knee, ...d } );

		}

		// tail
		const tail = new Group();
		tail.position.set( - 0.98, 1.55, 0 );
		body.add( tail );
		this.tail = tail;
		mesh( limbGeo( V( 0, 0, 0 ), V( - 0.16, - 0.3, 0 ), 0.06, 0.08, 8 ), M.mane, tail );
		mesh( limbGeo( V( - 0.16, - 0.3, 0 ), V( - 0.2, - 0.85, 0 ), 0.08, 0.03, 8 ), M.mane, tail );

		// caparison: an elliptical skirt from the back to below the knees, and a crupper over the rump
		const skirt = new CylinderGeometry( 0.9, 1.04, 0.84, 40, 6, true );
		skirt.translate( 0, 0.42, 0 );
		const uv = skirt.attributes.uv.array;
		for ( let i = 0; i < uv.length; i += 2 ) uv[ i ] *= 4; // four panels: flank, front, flank, back
		const cap = mesh( skirt, M.cloth, body, { p: [ - 0.04, 0.84, 0 ], s: [ 1.04, 1, 0.46 ] } );
		cap.frustumCulled = false;
		this.caparison = cap;
		const top = new SphereGeometry( 1, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2 );
		mesh( top, M.cloth, body, { p: [ - 0.04, 1.66, 0 ], s: [ 0.94, 0.14, 0.415 ] } );

		// saddle
		mesh( new BoxGeometry( 0.55, 0.1, 0.44 ), S.leather, body, { p: [ - 0.05, 1.77, 0 ] } );
		mesh( new BoxGeometry( 0.08, 0.34, 0.42 ), S.leather, body, { p: [ - 0.32, 1.9, 0 ], r: [ 0, 0, 0.2 ] } ); // cantle
		mesh( new BoxGeometry( 0.08, 0.2, 0.3 ), S.leather, body, { p: [ 0.22, 1.86, 0 ], r: [ 0, 0, - 0.2 ] } ); // pommel

	}

	// ------------------------------------------------------------------------------ rider

	buildRider() {

		const M = this.mats, S = shared();
		const rider = new Group();
		rider.position.set( - 0.04, SEAT_Y, 0 );
		this.body.add( rider );
		this.rider = rider;

		// legs astride
		for ( const z of [ - 1, 1 ] ) {

			mesh( limbGeo( V( 0.02, 0.05, z * 0.14 ), V( 0.34, - 0.2, z * 0.36 ), 0.085, 0.07 ), M.armour, rider );
			mesh( new SphereGeometry( 0.075, 10, 8 ), M.armour, rider, { p: [ 0.34, - 0.2, z * 0.36 ] } );
			mesh( limbGeo( V( 0.34, - 0.2, z * 0.36 ), V( 0.24, - 0.72, z * 0.4 ), 0.065, 0.055 ), M.armour, rider );
			mesh( new BoxGeometry( 0.26, 0.07, 0.09 ), M.armour, rider, { p: [ 0.3, - 0.76, z * 0.4 ], r: [ 0, 0, - 0.1 ] } );
			mesh( new TorusGeometry( 0.06, 0.012, 6, 10 ), S.gold, rider, { p: [ 0.26, - 0.78, z * 0.4 ], r: [ Math.PI / 2, 0, 0 ], shadow: false } );
			mesh( limbGeo( V( 0.26, - 0.72, z * 0.4 ), V( 0.02, - 0.05, z * 0.26 ), 0.01, 0.01, 4 ), S.leather, rider, { shadow: false } );

		}

		// torso: plate, surcoat over it, skirt of the surcoat
		mesh( limbGeo( V( 0, 0.02, 0 ), V( 0, 0.62, 0 ), 0.19, 0.22, 14 ), M.armour, rider, { s: [ 1, 1, 1.15 ] } );
		const coat = new CylinderGeometry( 0.235, 0.26, 0.5, 20, 1, true );
		const cuv = coat.attributes.uv.array;
		for ( let i = 0; i < cuv.length; i += 2 ) cuv[ i ] = cuv[ i ] * 2 + 0.25; // arms on front and back
		mesh( coat, M.surcoat, rider, { p: [ 0.0, 0.3, 0 ], s: [ 1, 1, 1.1 ], r: [ 0, 0, 0 ] } );
		mesh( new CylinderGeometry( 0.26, 0.34, 0.2, 20, 1, true ), M.surcoat, rider, { p: [ 0, - 0.02, 0 ], s: [ 1, 1, 1.15 ] } );
		mesh( new CylinderGeometry( 0.2, 0.2, 0.05, 16 ), S.leather, rider, { p: [ 0, 0.14, 0 ], s: [ 1.2, 1, 1.35 ] } ); // belt
		mesh( new CylinderGeometry( 0.1, 0.16, 0.12, 12 ), M.armour, rider, { p: [ 0, 0.68, 0 ] } ); // gorget

		// shoulders
		for ( const z of [ - 1, 1 ] ) mesh( new SphereGeometry( 1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6 ), M.armour, rider, { p: [ 0, 0.56, z * 0.26 ], s: [ 0.15, 0.12, 0.14 ] } );

		// right arm: couches the lance under the armpit (+z is the rider's right)
		const ra = new Group();
		rider.add( ra );
		this.rightArm = ra;
		mesh( limbGeo( V( 0, 0.55, 0.27 ), V( - 0.1, 0.3, 0.29 ), 0.065, 0.06 ), M.armour, ra );
		mesh( new SphereGeometry( 0.065, 10, 8 ), M.armour, ra, { p: [ - 0.1, 0.3, 0.29 ] } );
		mesh( limbGeo( V( - 0.1, 0.3, 0.29 ), V( 0.18, 0.32, 0.22 ), 0.055, 0.05 ), M.armour, ra );
		mesh( new SphereGeometry( 0.06, 10, 8 ), M.armour, ra, { p: [ 0.2, 0.32, 0.22 ] } );
		this.grip = new Group();
		this.grip.position.set( 0.2, 0.32, 0.22 );
		ra.add( this.grip );

		// left arm: holds the reins, the shield strapped to it
		mesh( limbGeo( V( 0, 0.55, - 0.27 ), V( 0.08, 0.32, - 0.3 ), 0.065, 0.06 ), M.armour, rider );
		mesh( limbGeo( V( 0.08, 0.32, - 0.3 ), V( 0.34, 0.22, - 0.1 ), 0.055, 0.05 ), M.armour, rider );
		mesh( new SphereGeometry( 0.06, 10, 8 ), M.armour, rider, { p: [ 0.35, 0.22, - 0.09 ] } );
		const sh = new Group();
		sh.position.set( 0.16, 0.42, - 0.33 );
		rider.add( sh );
		this.shieldGroup = sh;
		const shield = mesh( shieldGeometry(), M.shield, sh );
		shield.rotation.set( 0, Math.PI / 2, 0 ); // front faces +x
		this.shield = shield;
		this.shieldRest = { ry: - 0.55, rz: 0.1 };

		// head and helms
		const head = new Group();
		head.position.set( 0.01, 0.87, 0 );
		rider.add( head );
		this.riderHead = head;
		this.buildHead( head );

	}

	buildHead( head ) {

		const M = this.mats, S = shared();
		// the face, visible under an open helm or when the helm comes off
		const face = new Group();
		head.add( face );
		this.face = face;
		mesh( new SphereGeometry( 0.11, 16, 12 ), M.skin, face, { s: [ 1, 1.12, 0.95 ] } );
		mesh( new ConeGeometry( 0.022, 0.06, 6 ), M.skin, face, { p: [ 0.115, 0.0, 0 ], r: [ 0, 0, - Math.PI / 2 - 0.3 ] } );
		for ( const z of [ - 1, 1 ] ) {

			mesh( new SphereGeometry( 0.016, 8, 6 ), S.white, face, { p: [ 0.093, 0.03, z * 0.038 ], shadow: false } );
			mesh( new SphereGeometry( 0.009, 6, 4 ), S.dark, face, { p: [ 0.106, 0.03, z * 0.038 ], shadow: false } );
			mesh( new SphereGeometry( 0.025, 8, 6 ), M.skin, face, { p: [ 0.0, 0.0, z * 0.108 ], s: [ 0.6, 1, 0.5 ] } ); // ears

		}

		this.hairCap = mesh( new SphereGeometry( 0.118, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52 ), M.hair, face, { p: [ - 0.012, 0.02, 0 ], s: [ 1, 1.12, 1 ], r: [ 0, 0, 0.35 ] } );
		this.beards = [
			null,
			mesh( new SphereGeometry( 0.112, 14, 8, 0, Math.PI, Math.PI * 0.55, Math.PI * 0.45 ), M.hair, face, { p: [ 0.012, 0.01, 0 ], r: [ 0, - Math.PI / 2, 0 ], s: [ 1, 1.15, 1.0 ] } ),
			mesh( new SphereGeometry( 0.118, 14, 8, 0, Math.PI, Math.PI * 0.52, Math.PI * 0.48 ), M.hair, face, { p: [ 0.03, 0.01, 0 ], r: [ 0, - Math.PI / 2, 0 ], s: [ 1, 1.45, 1.08 ] } ),
			mesh( new TorusGeometry( 0.035, 0.012, 6, 10, Math.PI ), M.hair, face, { p: [ 0.108, - 0.035, 0 ], r: [ 0, Math.PI / 2, 0 ] } ),
		];

		// helms: all built once, one visible
		const A = M.armour;
		this.helms = {};
		const slit = ( g, y, x = 0.15, w = 0.2 ) => mesh( new BoxGeometry( 0.03, 0.022, w ), S.dark, g, { p: [ x, y, 0 ], shadow: false } );

		let g = new Group(); head.add( g ); this.helms.greathelm = g;
		mesh( new CylinderGeometry( 0.145, 0.15, 0.34, 18 ), A, g, { p: [ 0, 0.01, 0 ], s: [ 1.05, 1, 1 ] } );
		mesh( new SphereGeometry( 0.148, 18, 6, 0, Math.PI * 2, 0, Math.PI * 0.3 ), A, g, { p: [ 0, 0.14, 0 ], s: [ 1.05, 0.7, 1 ] } );
		slit( g, 0.04 ); slit( g, 0.0 );
		mesh( new BoxGeometry( 0.02, 0.16, 0.03 ), S.gold, g, { p: [ 0.158, - 0.08, 0 ] } );
		mesh( new BoxGeometry( 0.02, 0.03, 0.12 ), S.gold, g, { p: [ 0.158, - 0.08, 0 ] } );

		g = new Group(); head.add( g ); this.helms.frogmouth = g;
		mesh( new CylinderGeometry( 0.13, 0.17, 0.3, 18 ), A, g, { p: [ - 0.01, - 0.04, 0 ] } );
		mesh( new SphereGeometry( 0.14, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5 ), A, g, { p: [ - 0.02, 0.1, 0 ], s: [ 1.25, 0.9, 1 ] } );
		mesh( new ConeGeometry( 0.13, 0.22, 4 ), A, g, { p: [ 0.13, 0.08, 0 ], r: [ 0, Math.PI / 4, - Math.PI / 2 ], s: [ 1, 1, 0.45 ] } ); // the beak over the sight
		slit( g, 0.05, 0.12, 0.22 );

		g = new Group(); head.add( g ); this.helms.hounskull = g;
		mesh( new SphereGeometry( 0.14, 18, 12 ), A, g, { p: [ 0, 0.03, 0 ], s: [ 1.05, 1.1, 1 ] } );
		mesh( new ConeGeometry( 0.08, 0.14, 12 ), A, g, { p: [ 0, 0.2, 0 ], r: [ 0, 0, 0.35 ] } );
		mesh( new ConeGeometry( 0.1, 0.24, 14 ), A, g, { p: [ 0.17, - 0.01, 0 ], r: [ 0, 0, - Math.PI / 2 ], s: [ 1, 1, 0.9 ] } );
		for ( const z of [ - 1, 1 ] ) mesh( new BoxGeometry( 0.02, 0.018, 0.07 ), S.dark, g, { p: [ 0.15, 0.05, z * 0.05 ], r: [ 0, z * 0.5, 0 ], shadow: false } );
		mesh( new CylinderGeometry( 0.13, 0.26, 0.2, 18 ), S.mail, g, { p: [ - 0.01, - 0.16, 0 ] } ); // aventail

		g = new Group(); head.add( g ); this.helms.armet = g;
		mesh( new SphereGeometry( 0.145, 18, 12 ), A, g, { p: [ - 0.01, 0.02, 0 ], s: [ 1.05, 1.15, 1 ] } );
		mesh( new SphereGeometry( 0.12, 16, 10, 0, Math.PI, 0, Math.PI ), A, g, { p: [ 0.05, - 0.02, 0 ], r: [ 0, - Math.PI / 2, 0 ], s: [ 1, 1.05, 1.25 ] } );
		slit( g, 0.035, 0.155, 0.18 );
		mesh( new CylinderGeometry( 0.05, 0.05, 0.02, 12 ), A, g, { p: [ - 0.16, - 0.06, 0 ], r: [ 0, 0, Math.PI / 2 ] } ); // rondel
		mesh( new BoxGeometry( 0.03, 0.26, 0.02 ), S.gold, g, { p: [ - 0.02, 0.1, 0 ], r: [ 0, 0, - 0.9 ] } ); // comb

		g = new Group(); head.add( g ); this.helms.barbute = g;
		mesh( new SphereGeometry( 0.145, 18, 12, Math.PI * 0.72, Math.PI * 1.56, 0, Math.PI * 0.72 ), A, g, { p: [ 0, 0.02, 0 ], s: [ 1.02, 1.15, 1.02 ] } );
		mesh( new BoxGeometry( 0.03, 0.12, 0.02 ), A, g, { p: [ 0.135, 0.06, 0 ] } ); // nasal

		// plume on top, streaming back
		const pl = new Group();
		pl.position.set( - 0.02, 0.2, 0 );
		head.add( pl );
		this.plume = pl;
		for ( let i = 0; i < 5; i ++ ) mesh( new SphereGeometry( 0.07 - i * 0.008, 10, 8 ), M.plume, pl, { p: [ - i * 0.06, 0.04 + Math.sin( i * 0.8 ) * 0.05, 0 ], s: [ 1.3, 0.8, 0.7 ] } );

	}

	// ------------------------------------------------------------------------------ lance

	buildLance() {

		const M = this.mats, S = shared();
		// the lance lives in world space (aimed each frame from the grip); built along +z
		const lance = new Group();
		this.lance = lance;
		const L = 3.9;
		mesh( limbGeo( V( 0, 0, - 0.7 ), V( 0, 0, 0.1 ), 0.045, 0.06 ), M.lance, lance );
		mesh( new ConeGeometry( 0.15, 0.3, 16, 1, true ), M.armour, lance, { p: [ 0, 0, 0.24 ], r: [ - Math.PI / 2, 0, 0 ] } ); // vamplate
		this.lanceShaft = mesh( limbGeo( V( 0, 0, 0.1 ), V( 0, 0, 1.2 ), 0.06, 0.05 ), M.lance, lance );
		const front = new Group();
		lance.add( front );
		this.lanceFront = front;
		mesh( limbGeo( V( 0, 0, 1.2 ), V( 0, 0, L - 0.1 ), 0.05, 0.028 ), M.lance, front );
		mesh( new ConeGeometry( 0.05, 0.14, 8 ), M.armour, front, { p: [ 0, 0, L ], r: [ Math.PI / 2, 0, 0 ] } ); // coronel
		this.lanceStub = mesh( new ConeGeometry( 0.05, 0.25, 5 ), S.wood, lance, { p: [ 0, 0, 1.3 ], r: [ Math.PI / 2, 0, 0 ] } );
		this.lanceStub.visible = false;
		this.lanceLength = L;

	}

	// ------------------------------------------------------------------------------ options

	apply( o ) {

		this.options = o;
		const M = this.mats;
		const horse = HORSES[ o.horse ], arm = ARMOURS[ o.armour ];
		M.coat.uniforms.color.value.set( horse.coat );
		M.coat.uniforms.dapple.value = horse.dapple ? 1 : 0;
		M.mane.uniforms.color.value.set( horse.mane );
		M.socks.uniforms.color.value.set( horse.socks ? 0xece6da : horse.coat );
		this.blaze.visible = !! horse.blaze;
		M.armour.uniforms.color.value.set( arm.color );
		M.armour.uniforms.metalness.value = arm.metal;
		M.armour.uniforms.roughness.value = arm.rough;
		M.skin.uniforms.color.value.set( SKINS[ o.skin ] ?? SKINS[ 1 ] );
		M.hair.uniforms.color.value.set( ( HAIRS[ o.hair ] || HAIRS[ 1 ] ).c );
		const plume = PLUMES[ o.plume ] || PLUMES.none;
		this.plume.visible = !! plume.color;
		if ( plume.color ) M.plume.uniforms.color.value.set( plume.color );
		this.beards.forEach( ( b, i ) => b && ( b.visible = i === o.beard ) );
		for ( const k in this.helms ) this.helms[ k ].visible = k === o.helm && ! this.helmOff;
		this.face.visible = this.helmOff || o.helm === 'barbute';
		this.plume.visible = this.plume.visible && ! this.helmOff;
		const tint = ( id ) => new Color( 'rgb(' + ( { or: '214,166,38', argent: '236,232,222', gules: '172,28,32', azure: '30,62,150', vert: '28,108,50', sable: '24,22,24', purpure: '104,40,122', tenne: '196,98,26' }[ id ] || '236,232,222' ) + ')' );
		M.lance.uniforms.c1.value.copy( tint( o.arms.field[ 0 ] ) );
		M.lance.uniforms.c2.value.copy( tint( o.arms.field[ 1 ] === o.arms.field[ 0 ] ? 'argent' : o.arms.field[ 1 ] ) );

	}

	setSlot( slot ) {

		this.slot = slot;
		for ( const m of [ this.mats.cloth, this.mats.surcoat, this.mats.shield ] ) m.uniforms.slot.value = slot;

	}

	setHelmOff( off ) {

		this.helmOff = off;
		this.apply( this.options );

	}

	resetLance() {

		this.lanceBroken = false;
		this.lanceFront.visible = true;
		this.lanceStub.visible = false;

	}

	breakLance() {

		this.lanceBroken = true;
		this.lanceFront.visible = false;
		this.lanceStub.visible = true;

	}

	// world position of the lance tip (after update)
	lanceTip( target ) {

		const len = this.lanceBroken ? 1.4 : this.lanceLength;
		return target.set( 0, 0, len ).applyMatrix4( this.lance.matrixWorld );

	}

	// the rider is thrown: from now on he flies free of the horse
	unhorse( velocity ) {

		if ( this.fallen ) return;
		this.rider.updateWorldMatrix( true, false );
		const p = new Vector3().setFromMatrixPosition( this.rider.matrixWorld );
		const facing = this.group.rotation.y;
		this.body.remove( this.rider );
		this.group.parent.add( this.rider );
		this.rider.position.copy( p );
		this.rider.rotation.set( 0, facing, 0 );
		this.fallen = { t: 0, vel: velocity.clone().multiplyScalar( 0.55 ).add( new Vector3( 0, 2.2, 0 ) ), spin: 2.4 + Math.random() };

	}

	remount() {

		if ( ! this.fallen ) return;
		this.rider.parent.remove( this.rider );
		this.body.add( this.rider );
		this.rider.position.set( - 0.04, SEAT_Y, 0 );
		this.rider.rotation.set( 0, 0, 0 );
		this.fallen = null;

	}

	// ------------------------------------------------------------------------------ animation

	update( dt, time ) {

		const sp = this.speed;
		const target = sp < 0.2 ? 0 : sp < 4 ? 0.45 : Math.min( 1, 0.6 + sp / 28 );
		this.gait += ( target - this.gait ) * Math.min( 1, dt * 3 );
		const g = this.gait;
		const gallop = g > 0.5;
		const freq = g < 0.05 ? 0 : gallop ? 1.7 + sp * 0.04 : 1.3 + sp * 0.12;
		this.phase = ( this.phase + dt * freq ) % 1;
		const TAU = Math.PI * 2;
		const offs = gallop ? [ 0.5, 0.42, 0.08, 0.0 ] : [ 0.0, 0.5, 0.5, 0.0 ];
		const amp = gallop ? 0.55 : 0.35 * ( g / 0.45 );
		this.legs.forEach( ( L, i ) => {

			const a = TAU * ( this.phase + offs[ i ] );
			let swing = Math.sin( a ) * amp;
			let bend = Math.max( 0, Math.sin( a + 1.2 ) ) * amp * 1.5;
			if ( g < 0.05 ) {

				// standing: shift the weight now and then, a victory prance lifts the forelegs
				swing = 0; bend = 0;
				if ( this.victory > 0 && L.front ) { const k = Math.max( 0, Math.sin( time * 4 + i * Math.PI ) ); swing = k * 0.5; bend = k * 1.2; }

			}

			L.hip.rotation.z = L.front ? swing : swing * 0.8 - 0.05;
			L.knee.rotation.z = L.front ? - bend : bend * 0.6;

		} );
		const bob = g < 0.05 ? Math.sin( time * 1.3 ) * 0.005 : Math.sin( TAU * this.phase * 2 ) * 0.035 * g;
		this.body.position.y = bob;
		this.body.rotation.z = g < 0.05 ? 0 : Math.sin( TAU * this.phase ) * 0.05 * g;
		this.neck.rotation.z = ( g < 0.05 ? Math.sin( time * 0.7 ) * 0.04 : Math.sin( TAU * this.phase + 1 ) * 0.1 * g ) - g * 0.15;
		this.head.rotation.z = g * 0.12;
		this.tail.rotation.z = 0.3 * g + Math.sin( time * 2.1 ) * 0.08;
		this.tail.rotation.x = Math.sin( time * 1.3 ) * 0.15;
		this.mats.cloth.uniforms.speed.value = Math.min( 1, sp / 12 );
		if ( this.plume.visible ) this.plume.rotation.z = - Math.min( 0.5, sp * 0.04 ) + Math.sin( time * 7 ) * 0.04 * g;

		if ( ! this.fallen ) {

			// the rider leans into the charge and absorbs the gait
			this.recoil = Math.max( 0, this.recoil - dt * 1.6 );
			const rc = Math.sin( Math.min( 1, this.recoil ) * Math.PI * 0.5 );
			this.rider.rotation.z = - g * 0.12 - this.body.rotation.z * 0.6 + rc * 0.45;
			this.rider.position.y = SEAT_Y - bob * 0.4;

		} else {

			const f = this.fallen;
			f.t += dt;
			f.vel.y -= 9.81 * dt;
			this.rider.position.addScaledVector( f.vel, dt );
			if ( this.rider.position.y < 0.3 ) {

				this.rider.position.y = 0.3;
				f.vel.multiplyScalar( Math.max( 0, 1 - dt * 5 ) );
				f.vel.y = 0;

			}

			this.rider.rotation.z = Math.min( Math.PI / 2 * 0.95, this.rider.rotation.z + f.spin * dt );

		}

		// shield: raised across the body when braced
		const b = this.shieldBrace;
		this.shieldGroup.rotation.set( 0, this.shieldRest.ry * ( 1 - b ) - 0.2 * b, this.shieldRest.rz );
		this.shieldGroup.position.set( 0.16 + b * 0.08, 0.42 + b * 0.08, - 0.33 + b * 0.12 );

		this.aimLance( dt );

	}

	aimLance( dt ) {

		this.group.updateMatrixWorld( true );
		const grip = this.grip.getWorldPosition( _v );
		this.lance.position.copy( grip );
		const want = this.lanceAim ? 1 : 0;
		this.lanceLower += ( want - this.lanceLower ) * Math.min( 1, dt * 2.5 );
		// raised: point up and a little forward; couched: at the aim point
		const facing = this.group.rotation.y;
		const fwd = new Vector3( Math.cos( facing ), 0, - Math.sin( facing ) );
		const up = fwd.clone().multiplyScalar( 0.35 ).add( new Vector3( 0, 1, 0 ) );
		if ( this.fallen ) up.set( fwd.x, 0.1, fwd.z );
		let dir = up.normalize();
		if ( this.lanceAim ) {

			const aim = this.lanceAim.clone().sub( grip ).normalize();
			dir = up.clone().lerp( aim, this.lanceLower ).normalize();

		}

		this.lance.lookAt( grip.x + dir.x, grip.y + dir.y, grip.z + dir.z );
		this.lance.updateMatrixWorld( true );

	}

}
