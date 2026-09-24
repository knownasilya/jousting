import { Group, Mesh, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, TorusGeometry, BufferGeometry, Float32BufferAttribute, Vector3 } from '../engine/index.js';
import { loft, tube } from './Loft.js';

// The geometry of a mounted knight: a lofted horse with jointed legs, a draped caparison, and a
// rider in fitted plate with a heraldic tabard, five helms with wreath, mantling and plume.
// Everything faces +x. These functions fill in the parts the Knight animates (see Knight.js).

export const SEAT_Y = 1.82;

const SIDE_V = new Vector3( 0, 0, - 1 ); // for vertical spines: "up" of a section then faces +x (the front)

export function mesh( geo, mat, parent, { p, r, s, shadow = true } = {} ) {

	const m = new Mesh( geo, mat );
	if ( p ) m.position.set( ...p );
	if ( r ) m.rotation.set( ...r );
	if ( s ) typeof s === 'number' ? m.scale.setScalar( s ) : m.scale.set( ...s );
	m.castShadow = shadow;
	m.receiveShadow = true;
	parent.add( m );
	return m;

}

// a limb tube in a vertical-ish plane: points [ x, y ] (z fixed), radii, flattened sideways
const limb = ( pts, radii, z = 0, flat = 0.85, seg = 12 ) => tube( pts.map( ( [ x, y ] ) => [ x, y, z ] ), radii, { seg, flat, side: SIDE_V } );

// ------------------------------------------------------------------------------------------ horse

const BODY = [
	{ p: [ - 1.04, 1.5, 0 ], w: 0.08, up: 0.07, down: 0.08 },
	{ p: [ - 0.95, 1.47, 0 ], w: 0.27, up: 0.18, down: 0.28 },
	{ p: [ - 0.75, 1.44, 0 ], w: 0.34, up: 0.23, down: 0.38 },
	{ p: [ - 0.46, 1.4, 0 ], w: 0.33, up: 0.24, down: 0.4, keel: 0.02 },
	{ p: [ - 0.15, 1.36, 0 ], w: 0.34, up: 0.27, down: 0.42, keel: 0.04 },
	{ p: [ 0.15, 1.37, 0 ], w: 0.33, up: 0.3, down: 0.42, keel: 0.04 },
	{ p: [ 0.42, 1.42, 0 ], w: 0.29, up: 0.33, down: 0.4 },
	{ p: [ 0.66, 1.44, 0 ], w: 0.24, up: 0.3, down: 0.36 },
	{ p: [ 0.84, 1.42, 0 ], w: 0.17, up: 0.22, down: 0.24 },
	{ p: [ 0.93, 1.4, 0 ], w: 0.05, up: 0.07, down: 0.07 },
];

export function buildHorse( k ) {

	const M = k.mats, S = k.shared;
	const horse = new Group();
	k.group.add( horse );
	k.horse = horse;
	const body = new Group();
	horse.add( body );
	k.body = body;

	mesh( loft( BODY.map( ( r ) => ( { ...r, n: 2.2 } ) ), { seg: 28, steps: 4 } ), M.coat, body );

	// neck (pivots at its base) and head (pivots at the poll)
	const NB = [ 0.6, 1.64 ];
	const neck = new Group();
	neck.position.set( NB[ 0 ], NB[ 1 ], 0 );
	body.add( neck );
	k.neck = neck;
	const neckGeo = loft( [
		{ p: [ 0.5, 1.52, 0 ], w: 0.21, up: 0.3, down: 0.3 },
		{ p: [ 0.72, 1.76, 0 ], w: 0.16, up: 0.22, down: 0.21, crest: 0.03 },
		{ p: [ 0.9, 2.0, 0 ], w: 0.115, up: 0.16, down: 0.14, crest: 0.035 },
		{ p: [ 1.02, 2.2, 0 ], w: 0.095, up: 0.12, down: 0.1 },
		{ p: [ 1.07, 2.28, 0 ], w: 0.085, up: 0.08, down: 0.08 },
	], { seg: 20, steps: 4 } );
	neckGeo.translate( - NB[ 0 ], - NB[ 1 ], 0 );
	mesh( neckGeo, M.coat, neck );
	// mane along the crest, falling to the right, and a forelock
	const maneGeo = loft( [
		{ p: [ 0.46, 1.8, 0.03 ], w: 0.03, up: 0.03, down: 0.03 },
		{ p: [ 0.6, 1.93, 0.07 ], w: 0.045, up: 0.07, down: 0.1 },
		{ p: [ 0.78, 2.12, 0.08 ], w: 0.045, up: 0.07, down: 0.11 },
		{ p: [ 0.94, 2.3, 0.06 ], w: 0.04, up: 0.06, down: 0.08 },
		{ p: [ 1.04, 2.38, 0.02 ], w: 0.02, up: 0.03, down: 0.03 },
	], { seg: 12, steps: 4 } );
	maneGeo.translate( - NB[ 0 ], - NB[ 1 ], 0 );
	mesh( maneGeo, M.mane, neck );
	// forelock over the brow
	mesh( new ConeGeometry( 0.04, 0.16, 6 ), M.mane, neck, { p: [ 1.1 - NB[ 0 ], 2.3 - NB[ 1 ], 0 ], r: [ 0, 0, - 2.3 ], s: [ 1, 1, 0.5 ] } );

	const head = new Group();
	head.position.set( 1.06 - NB[ 0 ], 2.26 - NB[ 1 ], 0 );
	neck.add( head );
	k.head = head;
	const headRings = [
		{ p: [ - 0.02, 0.03, 0 ], w: 0.08, up: 0.07, down: 0.09 },
		{ p: [ 0.05, - 0.08, 0 ], w: 0.105, up: 0.08, down: 0.17 },
		{ p: [ 0.15, - 0.23, 0 ], w: 0.09, up: 0.075, down: 0.12 },
		{ p: [ 0.25, - 0.38, 0 ], w: 0.075, up: 0.065, down: 0.075 },
		{ p: [ 0.33, - 0.5, 0 ], w: 0.072, up: 0.06, down: 0.07 },
		{ p: [ 0.37, - 0.56, 0 ], w: 0.055, up: 0.045, down: 0.05 },
	];
	mesh( loft( headRings.map( ( r ) => ( { ...r, n: 2.3 } ) ), { seg: 18, steps: 4 } ), M.coat, head );
	// white blaze down the face
	k.blaze = mesh( loft( headRings.slice( 1 ).map( ( r ) => ( { ...r, w: r.w + 0.004, up: r.up + 0.004, down: r.down + 0.004 } ) ), { seg: 10, steps: 3, arc: [ Math.PI * 0.44, Math.PI * 0.56 ] } ), S.white, head, { shadow: false } );
	// chanfron: a steel plate over the face, with a spike and ear cups
	k.chanfron = mesh( loft( headRings.slice( 0, 5 ).map( ( r, i ) => ( { ...r, w: r.w + 0.012, up: r.up + 0.012 + ( i === 1 ? 0.005 : 0 ), down: r.down + 0.012 } ) ), { seg: 12, steps: 3, arc: [ Math.PI * 0.3, Math.PI * 0.7 ] } ), M.armour, head );
	mesh( new ConeGeometry( 0.025, 0.2, 8 ), M.armour, head, { p: [ 0.13, - 0.1, 0 ], r: [ 0, 0, - 0.6 ] } );
	mesh( new SphereGeometry( 0.03, 10, 6 ), S.gold, head, { p: [ 0.11, - 0.12, 0 ] } );
	for ( const z of [ - 1, 1 ] ) {

		mesh( new ConeGeometry( 0.04, 0.15, 8 ), M.coat, head, { p: [ - 0.05, 0.12, z * 0.055 ], r: [ z * 0.25, 0, 0.35 ], s: [ 1, 1, 0.6 ] } ); // ears
		mesh( new SphereGeometry( 0.024, 10, 8 ), S.eye, head, { p: [ 0.06, - 0.05, z * 0.098 ], shadow: false } );
		mesh( new SphereGeometry( 0.018, 8, 6 ), S.dark, head, { p: [ 0.37, - 0.5, z * 0.042 ], s: [ 1, 1.4, 0.6 ], shadow: false } ); // nostrils

	}

	// bridle and reins
	mesh( new TorusGeometry( 0.092, 0.01, 6, 20 ), S.leather, head, { p: [ 0.25, - 0.38, 0 ], r: [ 0, Math.PI / 2, 0.58 ], s: [ 1, 1.1, 1 ], shadow: false } );
	mesh( new TorusGeometry( 0.12, 0.01, 6, 20 ), S.leather, head, { p: [ 0.03, - 0.08, 0 ], r: [ 0, Math.PI / 2, 0.58 ], s: [ 1, 1.3, 1 ], shadow: false } );
	for ( const z of [ - 1, 1 ] ) mesh( limbGeo( [ 1.36, 1.72, z * 0.075 ], [ 0.46, 1.98, z * 0.14 ], 0.006 ), S.leather, body, { shadow: false } );

	// legs: hip pivot -> upper leg -> knee / hock pivot -> cannon, fetlock, pastern -> hoof
	k.legs = [];
	const defs = [
		{ x: 0.55, z: 0.17, front: true }, { x: 0.55, z: - 0.17, front: true },
		{ x: - 0.62, z: 0.19, front: false }, { x: - 0.62, z: - 0.19, front: false },
	];
	for ( const d of defs ) {

		const hip = new Group();
		hip.position.set( d.x, 1.2, d.z );
		body.add( hip );
		const knee = new Group();
		hip.add( knee );
		if ( d.front ) {

			mesh( limb( [ [ 0.02, 0.16 ], [ 0.02, - 0.08 ], [ 0.02, - 0.34 ], [ 0.02, - 0.53 ] ], [ 0.14, 0.12, 0.085, 0.075 ], 0, 0.8 ), M.coat, hip );
			knee.position.set( 0.02, - 0.53, 0 );

		} else {

			mesh( limb( [ [ 0.06, 0.18 ], [ 0.0, - 0.08 ], [ - 0.09, - 0.33 ], [ - 0.14, - 0.52 ] ], [ 0.18, 0.15, 0.095, 0.078 ], 0, 0.75 ), M.coat, hip );
			knee.position.set( - 0.14, - 0.52, 0 );

		}

		mesh( limb( [ [ 0, 0.03 ], [ 0, - 0.12 ], [ 0.01, - 0.38 ], [ 0.02, - 0.45 ], [ 0.05, - 0.53 ], [ 0.06, - 0.56 ] ], [ 0.075, 0.062, 0.055, 0.07, 0.056, 0.06 ], 0, 0.78, 12 ), M.socks, knee );
		mesh( new CylinderGeometry( 0.066, 0.088, 0.11, 16 ), S.hoof, knee, { p: [ 0.07, - 0.6, 0 ], r: [ 0, 0, 0.1 ] } );
		mesh( new CylinderGeometry( 0.07, 0.066, 0.03, 16 ), M.socks, knee, { p: [ 0.065, - 0.54, 0 ], r: [ 0, 0, 0.1 ] } ); // coronet
		k.legs.push( { hip, knee, ...d } );

	}

	// tail: a thick switch of hair
	const tail = new Group();
	tail.position.set( - 1.0, 1.54, 0 );
	body.add( tail );
	k.tail = tail;
	mesh( limb( [ [ 0, 0 ], [ - 0.12, - 0.14 ], [ - 0.18, - 0.42 ], [ - 0.17, - 0.72 ], [ - 0.12, - 0.9 ] ], [ 0.05, 0.075, 0.09, 0.07, 0.02 ], 0, 0.55 ), M.mane, tail );

	buildCaparison( k, body );
	buildSaddle( k, body );

}

function limbGeo( a, b, r ) {

	return tube( [ a, b ], [ r, r ], { seg: 5, steps: 1 } );

}

// the caparison: a skirt with folds and a scalloped gold hem, over a dome that drapes the back.
// uv.x runs round the horse in four panels (front, flank, back, flank), uv.y is 0 at the hem.
function buildCaparison( k, body ) {

	const M = k.mats;
	const L = 1.07, W = 0.41, CX = - 0.08, HEM = 0.74, SH = 1.5, DOME = 0.37;
	const cols = 72, skirtRows = 10, domeRows = 7;
	const pos = [], uv = [], idx = [];
	const foot = ( phi ) => {

		const c = Math.cos( phi ), s = Math.sin( phi ), e = 2 / 2.6;
		return [ Math.sign( c ) * Math.pow( Math.abs( c ), e ), Math.sign( s ) * Math.pow( Math.abs( s ), e ) ];

	};

	for ( let r = 0; r <= skirtRows + domeRows; r ++ ) {

		for ( let j = 0; j <= cols; j ++ ) {

			const phi = j / cols * Math.PI * 2;
			const [ fx, fz ] = foot( phi );
			let x, y, z;
			if ( r <= skirtRows ) {

				const v = r / skirtRows; // 0 hem .. 1 shoulder line
				const flare = 1 + ( 1 - v ) * 0.05;
				const fold = 1 + Math.sin( phi * 26 ) * 0.035 * Math.pow( 1 - v, 1.3 );
				x = CX + fx * L * flare * fold;
				z = fz * W * flare * fold;
				y = HEM + ( SH - HEM ) * v;
				uv.push( j / cols * 4 + 0.5, v );

			} else {

				const t = ( r - skirtRows ) / domeRows; // 0 shoulder line .. 1 the spine
				const rad = 1 - t;
				x = CX + fx * L * Math.max( rad, 0.0001 );
				z = fz * W * rad;
				y = SH + DOME * Math.cbrt( 1 - rad * rad * rad );
				uv.push( j / cols * 4 + 0.5, 1 + t * 0.4 );

			}

			pos.push( x, y, z );

		}

	}

	const rows = skirtRows + domeRows;
	for ( let r = 0; r < rows; r ++ ) for ( let j = 0; j < cols; j ++ ) {

		const a = r * ( cols + 1 ) + j, b = a + 1, c = a + cols + 2, d = a + cols + 1;
		idx.push( a, b, d, b, c, d );

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uv, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	g.computeBoundingSphere();
	const cap = mesh( g, M.cloth, body );
	cap.frustumCulled = false;
	k.caparison = cap;

}

function buildSaddle( k, body ) {

	const S = k.shared;
	mesh( loft( [
		{ p: [ - 0.34, 1.8, 0 ], w: 0.2, up: 0.03, down: 0.05 },
		{ p: [ - 0.05, 1.8, 0 ], w: 0.24, up: 0.035, down: 0.06 },
		{ p: [ 0.24, 1.81, 0 ], w: 0.2, up: 0.03, down: 0.05 },
	], { seg: 16, steps: 3 } ), S.leather, body );
	// a high cantle behind and a pommel in front, as on a war saddle
	mesh( new TorusGeometry( 0.17, 0.035, 8, 16, Math.PI ), S.leather, body, { p: [ - 0.3, 1.84, 0 ], r: [ 0, Math.PI / 2, 0 ], s: [ 1, 1.2, 1 ] } );
	mesh( new TorusGeometry( 0.12, 0.03, 8, 14, Math.PI ), S.leather, body, { p: [ 0.21, 1.83, 0 ], r: [ 0, Math.PI / 2, 0 ], s: [ 1, 0.9, 1 ] } );
	mesh( new SphereGeometry( 0.025, 8, 6 ), S.gold, body, { p: [ 0.21, 1.94, 0 ] } );

}

// ------------------------------------------------------------------------------------------ rider

export function buildRider( k ) {

	const M = k.mats, S = k.shared;
	const rider = new Group();
	rider.position.set( - 0.04, SEAT_Y, 0 );
	k.body.add( rider );
	k.rider = rider;
	const A = M.armour;

	// legs astride: cuisse, poleyn with its fan, greave, pointed sabaton, spur
	for ( const z of [ - 1, 1 ] ) {

		mesh( tube( [ [ 0.0, 0.06, z * 0.13 ], [ 0.18, - 0.06, z * 0.28 ], [ 0.35, - 0.2, z * 0.36 ] ], [ 0.095, 0.085, 0.07 ], { seg: 12 } ), A, rider );
		mesh( new SphereGeometry( 0.072, 12, 8 ), A, rider, { p: [ 0.36, - 0.2, z * 0.37 ] } );
		mesh( new CylinderGeometry( 0.075, 0.075, 0.012, 14 ), A, rider, { p: [ 0.37, - 0.2, z * 0.42 ], r: [ Math.PI / 2, 0, 0 ] } );
		mesh( tube( [ [ 0.35, - 0.22, z * 0.37 ], [ 0.31, - 0.45, z * 0.4 ], [ 0.26, - 0.72, z * 0.41 ] ], [ 0.066, 0.06, 0.045 ], { seg: 12 } ), A, rider );
		mesh( loft( [
			{ p: [ 0.2, - 0.77, z * 0.41 ], w: 0.045, up: 0.035, down: 0.02 },
			{ p: [ 0.3, - 0.79, z * 0.41 ], w: 0.042, up: 0.03, down: 0.02 },
			{ p: [ 0.42, - 0.81, z * 0.41 ], w: 0.012, up: 0.008, down: 0.01 },
		], { seg: 10, steps: 3 } ), A, rider );
		mesh( new TorusGeometry( 0.055, 0.01, 6, 12 ), S.gold, rider, { p: [ 0.27, - 0.82, z * 0.41 ], r: [ Math.PI / 2, 0, 0 ], shadow: false } ); // stirrup
		mesh( limbGeo( [ 0.27, - 0.8, z * 0.41 ], [ 0.02, - 0.05, z * 0.28 ], 0.009 ), S.leather, rider, { shadow: false } );
		mesh( new ConeGeometry( 0.012, 0.07, 6 ), S.gold, rider, { p: [ 0.17, - 0.77, z * 0.41 ], r: [ 0, 0, Math.PI / 2 ] } );

	}

	// breastplate, with a ridge down the front and a flared fauld
	mesh( loft( [
		{ p: [ 0, - 0.04, 0 ], w: 0.2, up: 0.16, down: 0.14 },
		{ p: [ 0, 0.1, 0 ], w: 0.165, up: 0.13, down: 0.11 },
		{ p: [ 0.01, 0.3, 0 ], w: 0.19, up: 0.175, down: 0.12, crest: 0.025 },
		{ p: [ 0, 0.47, 0 ], w: 0.215, up: 0.15, down: 0.125, crest: 0.015 },
		{ p: [ - 0.01, 0.6, 0 ], w: 0.19, up: 0.1, down: 0.11 },
		{ p: [ 0, 0.68, 0 ], w: 0.085, up: 0.075, down: 0.075 },
	].map( ( r ) => ( { ...r, n: 2.3 } ) ), { seg: 28, steps: 4, side: SIDE_V } ), A, rider );
	// gorget
	mesh( loft( [
		{ p: [ 0, 0.62, 0 ], w: 0.14, up: 0.12, down: 0.12 },
		{ p: [ 0, 0.7, 0 ], w: 0.09, up: 0.09, down: 0.09 },
		{ p: [ 0, 0.78, 0 ], w: 0.075, up: 0.075, down: 0.075 },
	], { seg: 18, steps: 2, side: SIDE_V } ), A, rider );

	// the tabard: front and back panels in the knight's arms, down over the thighs
	const tabard = ( front ) => loft( [
		{ p: [ 0.0, - 0.3, 0 ], w: 0.3, up: 0.32, down: 0.26 },
		{ p: [ 0, - 0.05, 0 ], w: 0.23, up: 0.2, down: 0.17 },
		{ p: [ 0, 0.14, 0 ], w: 0.185, up: 0.155, down: 0.135 },
		{ p: [ 0.01, 0.34, 0 ], w: 0.205, up: 0.2, down: 0.135 },
		{ p: [ 0, 0.52, 0 ], w: 0.22, up: 0.165, down: 0.14 },
	], { seg: 14, steps: 4, side: SIDE_V, arc: front ? [ Math.PI * 0.07, Math.PI * 0.93 ] : [ Math.PI * 1.07, Math.PI * 1.93 ] } );
	mesh( tabard( true ), M.surcoat, rider );
	mesh( tabard( false ), M.surcoat, rider );
	mesh( loft( [ { p: [ 0, 0.1, 0 ], w: 0.19, up: 0.16, down: 0.145 }, { p: [ 0, 0.15, 0 ], w: 0.19, up: 0.16, down: 0.145 } ], { seg: 20, steps: 1, side: SIDE_V } ), S.leather, rider ); // belt
	mesh( new BoxGeometry( 0.05, 0.05, 0.02 ), S.gold, rider, { p: [ 0.17, 0.125, 0 ] } );

	// pauldrons: three overlapping lames each; the left (lance-facing) one is bigger
	for ( const z of [ - 1, 1 ] ) {

		const big = z < 0 ? 1.15 : 1;
		for ( let i = 0; i < 3; i ++ ) {

			mesh( new SphereGeometry( 1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5 ), A, rider, {
				p: [ 0, 0.6 - i * 0.07, z * ( 0.25 + i * 0.012 ) ], r: [ z * ( 0.35 + i * 0.12 ), 0, 0 ],
				s: [ 0.14 * big, 0.08 * big, 0.13 * big ].map( ( v ) => v * ( 1 - i * 0.07 ) ),
			} );

		}

		mesh( new TorusGeometry( 0.115 * big, 0.008, 6, 20, Math.PI ), S.gold, rider, { p: [ 0, 0.6, z * 0.25 ], r: [ z * 0.35, Math.PI / 2, 0 ], shadow: false } );

	}

	// right arm: couches the lance under the armpit
	const ra = new Group();
	rider.add( ra );
	k.rightArm = ra;
	arm( k, ra, [ 0, 0.55, 0.27 ], [ - 0.1, 0.3, 0.3 ], [ 0.2, 0.32, 0.22 ] );
	k.grip = new Group();
	k.grip.position.set( 0.2, 0.32, 0.22 );
	ra.add( k.grip );
	// left arm: holds the reins, the shield strapped to it
	arm( k, rider, [ 0, 0.55, - 0.27 ], [ 0.08, 0.32, - 0.3 ], [ 0.35, 0.22, - 0.09 ] );

	const sh = new Group();
	sh.position.set( 0.16, 0.42, - 0.34 );
	rider.add( sh );
	k.shieldGroup = sh;
	k.shield = mesh( k.shieldGeometry, M.shield, sh );
	k.shield.rotation.set( 0, Math.PI / 2, 0 );
	k.shieldRest = { ry: - 0.55, rz: 0.1 };

	const head = new Group();
	head.position.set( 0.01, 0.9, 0 );
	rider.add( head );
	k.riderHead = head;
	buildHead( k, head );

}

// rerebrace, couter with its fan, vambrace, gauntlet
function arm( k, parent, shoulder, elbow, hand ) {

	const A = k.mats.armour;
	const [ sx, sy, sz ] = shoulder, [ ex, ey, ez ] = elbow, [ hx, hy, hz ] = hand;
	mesh( tube( [ shoulder, elbow ], [ 0.078, 0.064 ], { seg: 14, steps: 1 } ), A, parent );
	mesh( new SphereGeometry( 0.075, 14, 10 ), A, parent, { p: elbow } );
	mesh( new CylinderGeometry( 0.07, 0.07, 0.01, 14 ), A, parent, { p: [ ex, ey, ez + Math.sign( ez ) * 0.05 ], r: [ Math.PI / 2, 0, 0 ] } );
	const wrist = [ ex + ( hx - ex ) * 0.8, ey + ( hy - ey ) * 0.8, ez + ( hz - ez ) * 0.8 ];
	mesh( tube( [ elbow, wrist ], [ 0.064, 0.05 ], { seg: 14, steps: 1 } ), A, parent );
	// flared cuff and a mailed fist
	const cuff = tube( [ wrist, [ wrist[ 0 ] + ( hx - ex ) * 0.12, wrist[ 1 ] + ( hy - ey ) * 0.12, wrist[ 2 ] + ( hz - ez ) * 0.12 ] ], [ 0.05, 0.07 ], { seg: 12, steps: 1, cap: [ false, false ] } );
	mesh( cuff, A, parent );
	mesh( new SphereGeometry( 0.055, 10, 8 ), A, parent, { p: hand, s: [ 1.1, 0.9, 0.9 ] } );
	void sx; void sy; void sz;

}

function buildHead( k, head ) {

	const M = k.mats, S = k.shared;
	const face = new Group();
	head.add( face );
	k.face = face;
	// skull and jaw
	mesh( loft( [
		{ p: [ 0, - 0.12, 0 ], w: 0.05, up: 0.05, down: 0.04 },
		{ p: [ 0, - 0.08, 0 ], w: 0.075, up: 0.085, down: 0.07 },
		{ p: [ 0, 0.0, 0 ], w: 0.09, up: 0.1, down: 0.1 },
		{ p: [ - 0.005, 0.07, 0 ], w: 0.095, up: 0.1, down: 0.11 },
		{ p: [ - 0.01, 0.13, 0 ], w: 0.07, up: 0.07, down: 0.08 },
		{ p: [ - 0.01, 0.155, 0 ], w: 0.02, up: 0.02, down: 0.02 },
	], { seg: 20, steps: 4, side: SIDE_V } ), M.skin, face );
	mesh( new ConeGeometry( 0.024, 0.07, 4 ), M.skin, face, { p: [ 0.105, 0.0, 0 ], r: [ 0, Math.PI / 4, - Math.PI / 2 - 0.35 ], s: [ 1, 1, 0.8 ] } ); // nose
	for ( const z of [ - 1, 1 ] ) {

		mesh( new SphereGeometry( 0.014, 8, 6 ), S.white, face, { p: [ 0.085, 0.035, z * 0.035 ], shadow: false } );
		mesh( new SphereGeometry( 0.008, 6, 4 ), S.dark, face, { p: [ 0.097, 0.035, z * 0.035 ], shadow: false } );
		mesh( new BoxGeometry( 0.01, 0.012, 0.04 ), M.hair, face, { p: [ 0.095, 0.058, z * 0.036 ], r: [ z * 0.15, 0, 0 ], shadow: false } ); // brows
		mesh( new SphereGeometry( 0.024, 8, 6 ), M.skin, face, { p: [ 0.0, 0.01, z * 0.095 ], s: [ 0.6, 1, 0.45 ] } ); // ears

	}

	mesh( new BoxGeometry( 0.008, 0.008, 0.04 ), S.lips, face, { p: [ 0.096, - 0.06, 0 ], shadow: false } );
	k.hairCap = mesh( loft( [
		{ p: [ - 0.015, - 0.02, 0 ], w: 0.1, up: 0.07, down: 0.11 },
		{ p: [ - 0.012, 0.07, 0 ], w: 0.102, up: 0.105, down: 0.118 },
		{ p: [ - 0.012, 0.13, 0 ], w: 0.078, up: 0.08, down: 0.09 },
		{ p: [ - 0.012, 0.165, 0 ], w: 0.02, up: 0.02, down: 0.02 },
	], { seg: 20, steps: 3, side: SIDE_V } ), M.hair, face );
	// beards: stubble shadow, full beard, moustache
	const beard = ( d ) => loft( [
		{ p: [ 0.0, - 0.13 - d * 0.06, 0 ], w: 0.03, up: 0.03 + d * 0.02, down: 0.02 },
		{ p: [ 0.0, - 0.09, 0 ], w: 0.08 + d * 0.01, up: 0.09 + d * 0.012, down: 0.05 },
		{ p: [ 0.0, - 0.02, 0 ], w: 0.096 + d * 0.004, up: 0.1 + d * 0.004, down: 0.07 },
		{ p: [ 0.0, 0.01, 0 ], w: 0.093, up: 0.098, down: 0.06 },
	], { seg: 16, steps: 3, side: SIDE_V, arc: [ - Math.PI * 0.1, Math.PI * 1.1 ] } );
	k.beards = [
		null,
		mesh( beard( 0 ), M.hair, face, { s: [ 1.01, 1, 1.01 ] } ),
		mesh( beard( 1 ), M.hair, face ),
		mesh( new TorusGeometry( 0.03, 0.011, 6, 12, Math.PI ), M.hair, face, { p: [ 0.1, - 0.05, 0 ], r: [ 0, Math.PI / 2, 0 ] } ),
	];

	// ---- helms
	const A = M.armour;
	k.helms = {};
	let g = null;
	const dark = ( p, size ) => mesh( new BoxGeometry( ...size ), S.dark, g, { p, shadow: false } );
	const add = ( id ) => { const h = new Group(); head.add( h ); k.helms[ id ] = h; return h; };

	g = add( 'greathelm' );
	mesh( loft( [
		{ p: [ 0, - 0.19, 0 ], w: 0.148, up: 0.165, down: 0.16 },
		{ p: [ 0, 0.04, 0 ], w: 0.15, up: 0.165, down: 0.155, crest: 0.02 },
		{ p: [ 0, 0.14, 0 ], w: 0.14, up: 0.15, down: 0.145, crest: 0.015 },
		{ p: [ 0, 0.185, 0 ], w: 0.1, up: 0.1, down: 0.1 },
		{ p: [ 0, 0.2, 0 ], w: 0.02, up: 0.02, down: 0.02 },
	].map( ( r ) => ( { ...r, n: 2.6 } ) ), { seg: 26, steps: 3, side: SIDE_V } ), A, g );
	dark( [ 0.172, 0.045, 0 ], [ 0.03, 0.02, 0.22 ] );
	dark( [ 0.172, 0.008, 0 ], [ 0.03, 0.016, 0.2 ] );
	for ( let i = 0; i < 6; i ++ ) dark( [ 0.16, - 0.06 - ( i % 3 ) * 0.03, 0.07 + Math.floor( i / 3 ) * 0.03 ], [ 0.03, 0.012, 0.012 ] );
	mesh( new BoxGeometry( 0.02, 0.2, 0.03 ), S.gold, g, { p: [ 0.175, - 0.06, 0 ] } );
	mesh( new BoxGeometry( 0.02, 0.03, 0.14 ), S.gold, g, { p: [ 0.175, - 0.06, 0 ] } );

	g = add( 'frogmouth' );
	mesh( loft( [
		{ p: [ - 0.01, - 0.2, 0 ], w: 0.16, up: 0.2, down: 0.16 },
		{ p: [ - 0.01, - 0.02, 0 ], w: 0.155, up: 0.21, down: 0.155 },
		{ p: [ - 0.01, 0.04, 0 ], w: 0.15, up: 0.16, down: 0.15 },
		{ p: [ - 0.01, 0.07, 0 ], w: 0.145, up: 0.22, down: 0.15, crest: 0.02 },
		{ p: [ - 0.02, 0.16, 0 ], w: 0.125, up: 0.14, down: 0.14 },
		{ p: [ - 0.02, 0.22, 0 ], w: 0.03, up: 0.03, down: 0.03 },
	].map( ( r ) => ( { ...r, n: 2.4 } ) ), { seg: 26, steps: 3, side: SIDE_V } ), A, g );
	dark( [ 0.15, 0.055, 0 ], [ 0.06, 0.018, 0.2 ] );
	for ( const z of [ - 1, 1 ] ) mesh( new SphereGeometry( 0.018, 8, 6 ), S.gold, g, { p: [ 0.05, - 0.1, z * 0.155 ] } );

	g = add( 'hounskull' );
	mesh( loft( [
		{ p: [ 0, - 0.05, 0 ], w: 0.14, up: 0.14, down: 0.15 },
		{ p: [ 0, 0.08, 0 ], w: 0.13, up: 0.13, down: 0.14 },
		{ p: [ - 0.02, 0.2, 0 ], w: 0.07, up: 0.07, down: 0.08 },
		{ p: [ - 0.04, 0.28, 0 ], w: 0.01, up: 0.01, down: 0.01 },
	], { seg: 24, steps: 3, side: SIDE_V } ), A, g );
	mesh( loft( [
		{ p: [ 0.05, 0.0, 0 ], w: 0.13, up: 0.1, down: 0.13 },
		{ p: [ 0.16, - 0.01, 0 ], w: 0.1, up: 0.08, down: 0.1 },
		{ p: [ 0.28, - 0.02, 0 ], w: 0.03, up: 0.025, down: 0.03 },
	], { seg: 20, steps: 3 } ), A, g );
	for ( const z of [ - 1, 1 ] ) mesh( new BoxGeometry( 0.05, 0.016, 0.06 ), S.dark, g, { p: [ 0.15, 0.045, z * 0.05 ], r: [ 0, z * 0.6, 0 ], shadow: false } );
	for ( let i = 0; i < 5; i ++ ) mesh( new SphereGeometry( 0.008, 6, 4 ), S.dark, g, { p: [ 0.2 - i * 0.012, - 0.05, 0.05 + i * 0.01 ], shadow: false } );
	mesh( loft( [
		{ p: [ 0, - 0.08, 0 ], w: 0.13, up: 0.12, down: 0.14 },
		{ p: [ 0, - 0.2, 0 ], w: 0.2, up: 0.17, down: 0.18 },
		{ p: [ 0, - 0.26, 0 ], w: 0.27, up: 0.2, down: 0.2 },
	], { seg: 24, steps: 2, side: SIDE_V, cap: [ false, false ] } ), S.mail, g );

	g = add( 'armet' );
	mesh( loft( [
		{ p: [ - 0.01, - 0.2, 0 ], w: 0.1, up: 0.12, down: 0.1 },
		{ p: [ - 0.01, - 0.08, 0 ], w: 0.14, up: 0.17, down: 0.15 },
		{ p: [ - 0.01, 0.05, 0 ], w: 0.148, up: 0.16, down: 0.16 },
		{ p: [ - 0.02, 0.15, 0 ], w: 0.12, up: 0.12, down: 0.14, crest: 0.02 },
		{ p: [ - 0.03, 0.21, 0 ], w: 0.02, up: 0.02, down: 0.03 },
	], { seg: 26, steps: 3, side: SIDE_V } ), A, g );
	dark( [ 0.153, 0.04, 0 ], [ 0.03, 0.018, 0.2 ] );
	mesh( new BoxGeometry( 0.014, 0.012, 0.3 ), S.gold, g, { p: [ 0.146, - 0.01, 0 ] } );
	mesh( new CylinderGeometry( 0.05, 0.05, 0.015, 14 ), A, g, { p: [ - 0.175, - 0.07, 0 ], r: [ 0, 0, Math.PI / 2 ] } );
	mesh( new SphereGeometry( 0.02, 8, 6 ), S.gold, g, { p: [ - 0.185, - 0.07, 0 ] } );

	g = add( 'barbute' );
	mesh( loft( [
		{ p: [ 0, - 0.2, 0 ], w: 0.13, up: 0.13, down: 0.14 },
		{ p: [ 0, - 0.04, 0 ], w: 0.14, up: 0.14, down: 0.15 },
		{ p: [ 0, 0.1, 0 ], w: 0.13, up: 0.13, down: 0.14 },
		{ p: [ - 0.01, 0.18, 0 ], w: 0.07, up: 0.07, down: 0.08 },
		{ p: [ - 0.01, 0.205, 0 ], w: 0.01, up: 0.01, down: 0.01 },
	], { seg: 26, steps: 3, side: SIDE_V, arc: [ Math.PI * 0.64, Math.PI * 2.36 ] } ), A, g );
	mesh( new BoxGeometry( 0.02, 0.11, 0.022 ), A, g, { p: [ 0.14, 0.03, 0 ] } );

	// the crest: a twisted wreath in the knight's colours, mantling down the back, and a plume
	const crest = new Group();
	head.add( crest );
	k.crest = crest;
	mesh( new TorusGeometry( 0.1, 0.022, 8, 22 ), M.lance, crest, { p: [ - 0.01, 0.19, 0 ], r: [ Math.PI / 2, 0, 0 ] } );
	for ( const z of [ - 1, 1 ] ) {

		mesh( loft( [
			{ p: [ - 0.04, 0.19, z * 0.07 ], w: 0.012, up: 0.07, down: 0.07 },
			{ p: [ - 0.14, 0.05, z * 0.12 ], w: 0.012, up: 0.09, down: 0.09 },
			{ p: [ - 0.24, - 0.14, z * 0.16 ], w: 0.012, up: 0.11, down: 0.1 },
			{ p: [ - 0.3, - 0.34, z * 0.2 ], w: 0.012, up: 0.1, down: 0.08 },
		], { seg: 8, steps: 4 } ), M.mantling, crest );

	}

	const pl = new Group();
	pl.position.set( - 0.02, 0.2, 0 );
	head.add( pl );
	k.plume = pl;
	for ( let i = 0; i < 7; i ++ ) {

		const z = ( i - 3 ) * 0.022, lift = 1 - Math.abs( i - 3 ) / 4;
		mesh( loft( [
			{ p: [ 0, 0, z ], w: 0.012, up: 0.02, down: 0.02 },
			{ p: [ - 0.06, 0.14 * lift + 0.05, z * 1.5 ], w: 0.02, up: 0.045, down: 0.045 },
			{ p: [ - 0.2, 0.18 * lift + 0.04, z * 2.2 ], w: 0.02, up: 0.05, down: 0.04 },
			{ p: [ - 0.34, 0.08 * lift - 0.02, z * 2.8 ], w: 0.012, up: 0.03, down: 0.02 },
			{ p: [ - 0.4, - 0.03, z * 3 ], w: 0.004, up: 0.006, down: 0.006 },
		], { seg: 8, steps: 3 } ), M.plume, pl );

	}

}
