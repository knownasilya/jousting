import { Group, Mesh, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, TorusGeometry, BufferGeometry, Float32BufferAttribute, Vector3, Quaternion, Matrix4, Color } from '../engine/index.js';
import { Material } from '../engine/webgpu.js';
import { heraldryAtlas, ATLAS_SLOTS } from './Materials.js';
import { buildHorse, buildRider, SEAT_Y } from './KnightModel.js';
import { HORSES, ARMOURS, PLUMES, SKINS, HAIRS } from '../game/Options.js';

// A mounted knight, built from primitives: horse with caparison, rider in plate with a surcoat,
// five helm styles, a heater shield and a lance. The model faces +x; `group` is placed on the ground.
//
// Each knight has its own materials (colours are uniforms, arms come from the heraldry atlas), so
// changing an option only changes uniform values and visibility: no new pipelines at run time.

const Y = new Vector3( 0, 1, 0 );
const _v = new Vector3(), _q = new Quaternion(), _m = new Matrix4();

export { SEAT_Y };

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
		eye: new Material( { name: 'eye', color: 0x0a0806, roughness: 0.08 } ),
		hoof: new Material( { name: 'hoof', color: 0x2a2420, roughness: 0.55 } ),
		lips: new Material( { name: 'lips', color: 0x8a4a3a, roughness: 0.6 } ),
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

		this.shared = shared();
		this.shieldGeometry = shieldGeometry();
		this.makeMaterials();
		buildHorse( this );
		buildRider( this );
		this.buildLance();
		this.apply( options );

	}

	makeMaterials() {

		const cloth = ( name, extraVertex = '', hem = false ) => new Material( {
			name, roughness: 0.85, side: 'double', alphaTest: hem ? 0.5 : 0,
			textures: { heraldry: heraldryAtlas },
			uniforms: { slot: [ 'f32', this.slot ], speed: [ 'f32', 0 ] },
			vertex: extraVertex,
			surface: /* wgsl */`
				let u = ( mat.slot + 0.02 + fract( in.uv.x ) * 0.96 ) / ${ ATLAS_SLOTS.toFixed( 1 ) };
				let t = textureSample( heraldry, smpLinearClamp, vec2f( u, clamp( 1.0 - in.uv.y, 0.0, 1.0 ) ) );
				s.albedo = t.rgb;
				// woven cloth: a faint weave and soft folds catch the light
				s.albedo *= 0.94 + 0.06 * sin( in.uv.x * 900.0 ) * sin( in.uv.y * 700.0 );
				${ hem ? `
				// a scalloped (dagged) hem with a gold border above it
				let sc = 0.045 * ( 0.5 + 0.5 * cos( fract( in.uv.x ) * 6.2831853 * 7.0 ) );
				s.alpha = select( 1.0, 0.0, in.uv.y < sc );
				if ( in.uv.y < sc + 0.07 && in.uv.y > sc + 0.02 ) { s.albedo = vec3f( 0.72, 0.52, 0.16 ); s.metalness = 0.8; s.roughness = 0.35; }
				` : '' }
			`,
		} );
		this.mats = {
			armour: new Material( { name: 'armour', color: 0xcccccc, metalness: 1, roughness: 0.25,
				surface: /* wgsl */`
					// hammered plate: roughness and tone vary a little over the surface
					let n = mx_noise_float3( in.P * 14.0 ) * 0.5 + 0.5;
					s.roughness = clamp( mat.roughness * ( 0.75 + 0.5 * n ), 0.05, 1.0 );
					s.albedo *= 0.92 + 0.08 * n;
				`,
			} ),
			mantling: new Material( { name: 'mantling', roughness: 0.85, side: 'double',
				vertex: 'v.position.z += sin( frame.time * 2.3 + v.position.x * 9.0 ) * 0.012 * clamp( - v.position.y * 3.0, 0.0, 1.0 );' } ),
			// caparison: the skirt streams back and ripples with speed (uv.y = 0 at the hem)
			cloth: cloth( 'caparison', /* wgsl */`
				let hem = 1.0 - v.uv.y;
				let sp = mat.speed;
				v.position.x -= hem * hem * sp * 0.3;
				v.position.y += hem * hem * sp * 0.08;
				let r = sin( frame.time * ( 4.0 + sp * 9.0 ) + v.uv.x * 40.0 ) * ( 0.012 + 0.03 * sp ) * hem;
				v.position += v.normal * r;
			`, true ),
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
		this.crest.visible = ! this.helmOff;
		this.plume.visible = this.plume.visible && ! this.helmOff;
		const tint = ( id ) => new Color( 'rgb(' + ( { or: '214,166,38', argent: '236,232,222', gules: '172,28,32', azure: '30,62,150', vert: '28,108,50', sable: '24,22,24', purpure: '104,40,122', tenne: '196,98,26' }[ id ] || '236,232,222' ) + ')' );
		M.lance.uniforms.c1.value.copy( tint( o.arms.field[ 0 ] ) );
		M.lance.uniforms.c2.value.copy( tint( o.arms.field[ 1 ] === o.arms.field[ 0 ] ? 'argent' : o.arms.field[ 1 ] ) );
		M.mantling.uniforms.color.value.copy( tint( o.arms.field[ 0 ] ) );

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
