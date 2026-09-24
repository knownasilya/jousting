// Heraldry: tinctures, field divisions and charges, painted into an RGBA pixel buffer.
//
// Pure JS (no canvas), so the same painter feeds the GPU atlas, the menu previews and the
// headless tests. A charge is a list of primitives in unit space (0..1, y down):
//   { c: [ x, y ], r }                 disc
//   { e: [ x, y ], rx, ry, a }         ellipse, rotated by a (radians)
//   { s: [ x0, y0, x1, y1 ], r }       capsule (a thick line)
//   { p: [ x0, y0, x1, y1, ... ] }     polygon (even-odd)
//   any of these with `cut: true`      removes coverage instead of adding it

export const TINCTURES = {
	or: { name: 'Or', rgb: [ 214, 166, 38 ] },
	argent: { name: 'Argent', rgb: [ 236, 232, 222 ] },
	gules: { name: 'Gules', rgb: [ 172, 28, 32 ] },
	azure: { name: 'Azure', rgb: [ 30, 62, 150 ] },
	vert: { name: 'Vert', rgb: [ 28, 108, 50 ] },
	sable: { name: 'Sable', rgb: [ 24, 22, 24 ] },
	purpure: { name: 'Purpure', rgb: [ 104, 40, 122 ] },
	tenne: { name: 'Tenné', rgb: [ 196, 98, 26 ] },
};
export const TINCTURE_IDS = Object.keys( TINCTURES );

// field divisions: ( u, v ) -> 0 (first tincture) or 1 (second)
export const DIVISIONS = {
	plain: { name: 'Plain', f: () => 0 },
	perPale: { name: 'Per pale', f: ( u ) => u < 0.5 ? 0 : 1 },
	perFess: { name: 'Per fess', f: ( u, v ) => v < 0.5 ? 0 : 1 },
	quarterly: { name: 'Quarterly', f: ( u, v ) => ( u < 0.5 ) === ( v < 0.5 ) ? 0 : 1 },
	perBend: { name: 'Per bend', f: ( u, v ) => u > v ? 0 : 1 },
	perSaltire: { name: 'Per saltire', f: ( u, v ) => ( Math.abs( u - 0.5 ) > Math.abs( v - 0.5 ) ) ? 1 : 0 },
	chevron: { name: 'Chevron', f: ( u, v ) => { const y = 0.72 - Math.abs( u - 0.5 ) * 0.9; return v > y - 0.11 && v < y + 0.11 ? 1 : 0; } },
	fess: { name: 'Fess', f: ( u, v ) => v > 0.36 && v < 0.64 ? 1 : 0 },
	pale: { name: 'Pale', f: ( u ) => u > 0.36 && u < 0.64 ? 1 : 0 },
	cross: { name: 'Cross', f: ( u, v ) => ( Math.abs( u - 0.5 ) < 0.11 || Math.abs( v - 0.45 ) < 0.11 ) ? 1 : 0 },
	saltire: { name: 'Saltire', f: ( u, v ) => ( Math.abs( u - v ) < 0.1 || Math.abs( u + v - 1 ) < 0.1 ) ? 1 : 0 },
	paly: { name: 'Paly', f: ( u ) => Math.floor( u * 6 ) % 2 },
	barry: { name: 'Barry', f: ( u, v ) => Math.floor( v * 6 ) % 2 },
	chequy: { name: 'Chequy', f: ( u, v ) => ( Math.floor( u * 5 ) + Math.floor( v * 5 ) ) % 2 },
};
export const DIVISION_IDS = Object.keys( DIVISIONS );

const mirror = ( prims ) => prims.concat( prims.map( ( q ) => {

	const m = { ...q };
	if ( q.c ) m.c = [ 1 - q.c[ 0 ], q.c[ 1 ] ];
	if ( q.e ) { m.e = [ 1 - q.e[ 0 ], q.e[ 1 ] ]; m.a = - ( q.a || 0 ); }
	if ( q.s ) m.s = [ 1 - q.s[ 0 ], q.s[ 1 ], 1 - q.s[ 2 ], q.s[ 3 ] ];
	if ( q.p ) m.p = q.p.map( ( x, i ) => i % 2 === 0 ? 1 - x : x );
	return m;

} ) );

function star( cx, cy, ro, ri, n, rot = - Math.PI / 2 ) {

	const p = [];
	for ( let i = 0; i < n * 2; i ++ ) {

		const a = rot + i * Math.PI / n, r = i % 2 ? ri : ro;
		p.push( cx + Math.cos( a ) * r, cy + Math.sin( a ) * r );

	}

	return { p };

}

export const CHARGES = {
	none: { name: 'None', prims: [] },
	lion: { name: 'Lion rampant', prims: [
		{ e: [ 0.47, 0.55 ], rx: 0.1, ry: 0.19, a: - 0.35 }, // body
		{ c: [ 0.56, 0.3 ], r: 0.11 }, // mane
		{ p: [ 0.6, 0.27, 0.72, 0.29, 0.7, 0.36, 0.6, 0.37 ] }, // muzzle
		{ p: [ 0.52, 0.2, 0.55, 0.12, 0.58, 0.21 ] }, // ear
		{ s: [ 0.56, 0.4, 0.7, 0.34 ], r: 0.035 }, { s: [ 0.7, 0.34, 0.76, 0.24 ], r: 0.03 }, // raised foreleg
		{ s: [ 0.55, 0.46, 0.68, 0.5 ], r: 0.035 }, { s: [ 0.68, 0.5, 0.74, 0.44 ], r: 0.03 },
		{ s: [ 0.42, 0.66, 0.54, 0.76 ], r: 0.05 }, { s: [ 0.54, 0.76, 0.5, 0.88 ], r: 0.035 }, // hind legs
		{ s: [ 0.38, 0.68, 0.34, 0.8 ], r: 0.045 }, { s: [ 0.34, 0.8, 0.4, 0.89 ], r: 0.03 },
		{ s: [ 0.36, 0.62, 0.26, 0.5 ], r: 0.022 }, { s: [ 0.26, 0.5, 0.3, 0.32 ], r: 0.02 }, // tail
		{ e: [ 0.31, 0.29 ], rx: 0.035, ry: 0.06, a: 0.3 },
		{ c: [ 0.63, 0.28 ], r: 0.015, cut: true }, // eye
	] },
	eagle: { name: 'Eagle displayed', prims: [
		{ e: [ 0.5, 0.52 ], rx: 0.09, ry: 0.19 },
		{ c: [ 0.5, 0.26 ], r: 0.07 },
		{ p: [ 0.54, 0.24, 0.63, 0.27, 0.55, 0.31 ] },
		...mirror( [
			{ p: [ 0.44, 0.42, 0.14, 0.2, 0.1, 0.3, 0.16, 0.34, 0.1, 0.42, 0.18, 0.44, 0.13, 0.53, 0.22, 0.53, 0.2, 0.62, 0.44, 0.56 ] },
			{ p: [ 0.46, 0.66, 0.35, 0.88, 0.44, 0.84, 0.5, 0.9 ] },
			{ s: [ 0.44, 0.66, 0.36, 0.74 ], r: 0.025 },
		] ),
		{ c: [ 0.52, 0.24 ], r: 0.013, cut: true },
	] },
	fleur: { name: 'Fleur-de-lis', prims: [
		{ p: [ 0.5, 0.1, 0.58, 0.28, 0.56, 0.52, 0.5, 0.6, 0.44, 0.52, 0.42, 0.28 ] },
		...mirror( [
			{ s: [ 0.44, 0.56, 0.3, 0.46 ], r: 0.045 }, { s: [ 0.3, 0.46, 0.22, 0.3 ], r: 0.04 }, { s: [ 0.22, 0.3, 0.28, 0.24 ], r: 0.03 },
			{ s: [ 0.46, 0.66, 0.38, 0.86 ], r: 0.04 }, { s: [ 0.38, 0.86, 0.3, 0.84 ], r: 0.03 },
		] ),
		{ p: [ 0.3, 0.56, 0.7, 0.56, 0.7, 0.64, 0.3, 0.64 ] },
		{ s: [ 0.5, 0.6, 0.5, 0.86 ], r: 0.04 },
	] },
	cross: { name: 'Cross pattée', prims: [
		{ c: [ 0.5, 0.46 ], r: 0.08 },
		...mirror( [ { p: [ 0.46, 0.46, 0.16, 0.3, 0.16, 0.62 ] } ] ),
		{ p: [ 0.5, 0.42, 0.34, 0.12, 0.66, 0.12 ] },
		{ p: [ 0.5, 0.5, 0.34, 0.82, 0.66, 0.82 ] },
	] },
	star: { name: 'Mullet', prims: [ star( 0.5, 0.47, 0.34, 0.14, 5 ) ] },
	sun: { name: 'Sun in splendour', prims: [ star( 0.5, 0.47, 0.36, 0.22, 16 ), { c: [ 0.5, 0.47 ], r: 0.2 } ] },
	crescent: { name: 'Crescent', prims: [ { c: [ 0.5, 0.48 ], r: 0.3 }, { c: [ 0.5, 0.36 ], r: 0.26, cut: true } ] },
	tower: { name: 'Tower', prims: [
		{ p: [ 0.3, 0.3, 0.7, 0.3, 0.7, 0.85, 0.3, 0.85 ] },
		{ p: [ 0.26, 0.2, 0.36, 0.2, 0.36, 0.32, 0.26, 0.32 ] }, { p: [ 0.45, 0.2, 0.55, 0.2, 0.55, 0.32, 0.45, 0.32 ] }, { p: [ 0.64, 0.2, 0.74, 0.2, 0.74, 0.32, 0.64, 0.32 ] },
		{ p: [ 0.26, 0.28, 0.74, 0.28, 0.74, 0.34, 0.26, 0.34 ] },
		{ p: [ 0.43, 0.86, 0.43, 0.68, 0.57, 0.68, 0.57, 0.86 ], cut: true }, { c: [ 0.5, 0.68 ], r: 0.07, cut: true },
		{ p: [ 0.47, 0.42, 0.53, 0.42, 0.53, 0.54, 0.47, 0.54 ], cut: true },
	] },
	crown: { name: 'Crown', prims: [
		{ p: [ 0.2, 0.66, 0.8, 0.66, 0.8, 0.78, 0.2, 0.78 ] },
		{ p: [ 0.2, 0.66, 0.2, 0.36, 0.35, 0.52, 0.5, 0.28, 0.65, 0.52, 0.8, 0.36, 0.8, 0.66 ] },
		{ c: [ 0.2, 0.33 ], r: 0.045 }, { c: [ 0.5, 0.24 ], r: 0.05 }, { c: [ 0.8, 0.33 ], r: 0.045 },
	] },
	sword: { name: 'Sword', prims: [
		{ p: [ 0.5, 0.88, 0.46, 0.78, 0.46, 0.34, 0.54, 0.34, 0.54, 0.78 ] },
		{ s: [ 0.3, 0.3, 0.7, 0.3 ], r: 0.03 },
		{ s: [ 0.5, 0.3, 0.5, 0.16 ], r: 0.025 }, { c: [ 0.5, 0.13 ], r: 0.04 },
	] },
	rose: { name: 'Rose', prims: [
		...[ 0, 1, 2, 3, 4 ].map( ( i ) => ( { c: [ 0.5 + Math.cos( i * 1.2566 - 1.5708 ) * 0.16, 0.47 + Math.sin( i * 1.2566 - 1.5708 ) * 0.16 ], r: 0.14 } ) ),
		{ c: [ 0.5, 0.47 ], r: 0.08, cut: true }, { c: [ 0.5, 0.47 ], r: 0.055 },
	] },
	boar: { name: 'Boar', prims: [
		{ e: [ 0.46, 0.5 ], rx: 0.24, ry: 0.14 },
		{ p: [ 0.62, 0.4, 0.84, 0.5, 0.84, 0.58, 0.62, 0.62 ] },
		{ p: [ 0.3, 0.38, 0.62, 0.34, 0.58, 0.4, 0.3, 0.42 ] }, // bristles
		{ p: [ 0.62, 0.38, 0.66, 0.3, 0.68, 0.42 ] },
		{ s: [ 0.78, 0.56, 0.74, 0.47 ], r: 0.015 },
		{ s: [ 0.32, 0.58, 0.3, 0.76 ], r: 0.035 }, { s: [ 0.42, 0.6, 0.42, 0.78 ], r: 0.035 },
		{ s: [ 0.56, 0.58, 0.58, 0.76 ], r: 0.035 }, { s: [ 0.26, 0.48, 0.2, 0.56 ], r: 0.015 },
		{ c: [ 0.7, 0.45 ], r: 0.014, cut: true },
	] },
};
export const CHARGE_IDS = Object.keys( CHARGES );

export const rgbOf = ( id ) => ( TINCTURES[ id ] || TINCTURES.argent ).rgb;
export const cssOf = ( id ) => `rgb(${ rgbOf( id ).join( ',' ) })`;

function inside( q, x, y ) {

	if ( q.c ) {

		const dx = x - q.c[ 0 ], dy = y - q.c[ 1 ];
		return dx * dx + dy * dy <= q.r * q.r;

	}

	if ( q.e ) {

		const c = Math.cos( q.a || 0 ), s = Math.sin( q.a || 0 );
		const dx = x - q.e[ 0 ], dy = y - q.e[ 1 ];
		const lx = dx * c + dy * s, ly = - dx * s + dy * c;
		return ( lx * lx ) / ( q.rx * q.rx ) + ( ly * ly ) / ( q.ry * q.ry ) <= 1;

	}

	if ( q.s ) {

		const [ x0, y0, x1, y1 ] = q.s;
		const vx = x1 - x0, vy = y1 - y0;
		const t = Math.max( 0, Math.min( 1, ( ( x - x0 ) * vx + ( y - y0 ) * vy ) / ( vx * vx + vy * vy || 1 ) ) );
		const dx = x - ( x0 + vx * t ), dy = y - ( y0 + vy * t );
		return dx * dx + dy * dy <= q.r * q.r;

	}

	const p = q.p;
	let c = false;
	for ( let i = 0, j = p.length - 2; i < p.length; j = i, i += 2 ) {

		if ( ( p[ i + 1 ] > y ) !== ( p[ j + 1 ] > y ) && x < ( p[ j ] - p[ i ] ) * ( y - p[ i + 1 ] ) / ( p[ j + 1 ] - p[ i + 1 ] ) + p[ i ] ) c = ! c;

	}

	return c;

}

function chargeAt( prims, x, y ) {

	let on = false;
	for ( const q of prims ) {

		if ( q.cut ) { if ( on && inside( q, x, y ) ) on = false; } else if ( ! on && inside( q, x, y ) ) on = true;

	}

	return on;

}

// the heater-shield outline in unit space (used to mask previews and for the mesh)
export function inShield( u, v ) {

	if ( u < 0.02 || u > 0.98 || v < 0.02 ) return false;
	if ( v < 0.45 ) return true;
	// the lower half narrows to a point along two arcs
	const t = ( v - 0.45 ) / 0.53;
	return Math.abs( u - 0.5 ) <= 0.48 * Math.sqrt( Math.max( 0, 1 - t * t ) );

}

// Paint `arms` ( { division, field: [ t0, t1 ], charge, chargeTincture } ) into `out` (RGBA8) at
// ( ox, oy ) of a buffer `stride` pixels wide. `shield` masks to the heater outline (transparent outside).
export function paintArms( arms, size, { out = new Uint8Array( size * size * 4 ), stride = size, ox = 0, oy = 0, shield = false, ss = 3, border = true } = {} ) {

	const div = ( DIVISIONS[ arms.division ] || DIVISIONS.plain ).f;
	const t0 = rgbOf( arms.field[ 0 ] ), t1 = rgbOf( arms.field[ 1 ] );
	const tc = rgbOf( arms.chargeTincture );
	const prims = ( CHARGES[ arms.charge ] || CHARGES.none ).prims;
	const n = ss * ss;
	for ( let py = 0; py < size; py ++ ) {

		for ( let px = 0; px < size; px ++ ) {

			let r = 0, g = 0, b = 0, a = 0;
			for ( let sy = 0; sy < ss; sy ++ ) for ( let sx = 0; sx < ss; sx ++ ) {

				const u = ( px + ( sx + 0.5 ) / ss ) / size, v = ( py + ( sy + 0.5 ) / ss ) / size;
				if ( shield && ! inShield( u, v ) ) continue;
				let c = div( u, v ) ? t1 : t0;
				if ( chargeAt( prims, u, v ) ) c = tc;
				// a thin dark edge line keeps the charge readable on any field
				else if ( prims.length && ( chargeAt( prims, u + 0.008, v ) || chargeAt( prims, u - 0.008, v ) || chargeAt( prims, u, v + 0.008 ) || chargeAt( prims, u, v - 0.008 ) ) ) c = [ 20, 16, 14 ];
				if ( border && shield && ! inShield( ( u - 0.5 ) * 1.05 + 0.5, ( v - 0.02 ) * 1.04 + 0.02 ) ) c = [ 70, 60, 50 ];
				r += c[ 0 ]; g += c[ 1 ]; b += c[ 2 ]; a ++;

			}

			const i = ( ( oy + py ) * stride + ox + px ) * 4;
			// straight colour (not premultiplied): average of the covered samples
			out[ i ] = a ? r / a : t0[ 0 ]; out[ i + 1 ] = a ? g / a : t0[ 1 ]; out[ i + 2 ] = a ? b / a : t0[ 2 ];
			out[ i + 3 ] = 255 * a / n;

		}

	}

	return out;

}

export function randomArms( rng = Math.random ) {

	const pick = ( a ) => a[ Math.floor( rng() * a.length ) ];
	// the rule of tincture, loosely: a metal next to a colour
	const metals = [ 'or', 'argent' ], colours = TINCTURE_IDS.filter( ( t ) => ! metals.includes( t ) );
	const metalFirst = rng() < 0.5;
	const a = metalFirst ? pick( metals ) : pick( colours ), b = metalFirst ? pick( colours ) : pick( metals );
	const division = pick( DIVISION_IDS );
	const charge = pick( CHARGE_IDS.filter( ( c ) => c !== 'none' ) );
	const chargeTincture = division === 'plain' ? b : pick( [ ...metals, 'sable' ].filter( ( t ) => t !== a && t !== b ) ) || b;
	return { division, field: [ a, b ], charge, chargeTincture };

}
