import { gauss } from './Rng.js';

// The rules of the joust, with no rendering: riders, aim, hit zones, bracing, unhorsing and the
// score of a bout. The App feeds it input and time; tests drive it directly.
//
// Coordinates: the tilt runs along x. A target point is ( h, y ): h is the offset from the
// defender's centre line toward the tilt (his left, where he bears the shield), y the height above
// the ground.

export const LIST = {
	start: 40, // riders start this far from the centre
	lane: 1.25, // distance of each lane from the tilt
	reach: 3.3, // gap along x between the riders when the lances meet
	lowerAt: 32, // gap at which the lances come down
	slowAt: 10, // gap at which the moment slows down
};

export const ZONES = {
	helm: { name: 'Helm', points: 3, unhorse: 0.34, center: [ 0.0, 2.7 ] },
	body: { name: 'Breastplate', points: 2, unhorse: 0.17, center: [ 0.0, 2.16 ] },
	shield: { name: 'Shield', points: 1, unhorse: 0.07, center: [ 0.3, 2.32 ] },
	miss: { name: 'Miss', points: 0, unhorse: 0, center: [ 0, 0 ] },
};

export const PASSES = 3;
export const MAX_PASSES = 7;

// which part of the defender a point strikes; a braced shield swings across the body
export function zoneAt( h, y, brace = 0 ) {

	const dh = h - 0.0, dy = y - 2.7;
	if ( dh * dh + dy * dy < 0.15 * 0.15 ) return { zone: 'helm', centred: 1 - Math.hypot( dh, dy ) / 0.15 };
	const sh0 = 0.08 - brace * 0.22, sy1 = 2.64 + brace * 0.06;
	if ( h > sh0 && h < 0.52 && y > 2.0 && y < sy1 ) {

		const c = ZONES.shield.center;
		return { zone: 'shield', centred: Math.max( 0, 1 - Math.hypot( h - c[ 0 ], y - c[ 1 ] ) / 0.32 ) };

	}

	if ( Math.abs( h ) < 0.25 && y > 1.76 && y < 2.55 ) {

		const c = ZONES.body.center;
		return { zone: 'body', centred: Math.max( 0, 1 - Math.hypot( h - c[ 0 ], y - c[ 1 ] ) / 0.4 ) };

	}

	return { zone: 'miss', centred: 0 };

}

// ---- horses and riding

export function maxSpeed( horse ) {

	return 7.5 + 5 * horse.stats.speed;

}

export function acceleration( horse ) {

	return 2.4 + 3.6 * horse.stats.accel;

}

export class Rider {

	constructor( horse ) {

		this.horse = horse;
		this.speed = 0;
		this.x = 0; // distance travelled along the lane
		this.spurring = false;

	}

	// spur: 0..1 (held / AI effort); unspurred horses settle into a canter
	step( dt, spur ) {

		const vmax = maxSpeed( this.horse );
		this.spurring = spur > 0;
		const target = spur > 0 ? vmax * spur : Math.min( this.speed, 4.5 );
		if ( this.speed < target ) this.speed = Math.min( target, this.speed + acceleration( this.horse ) * dt * ( spur > 0 ? 1 : 0.6 ) );
		else this.speed = Math.max( target, this.speed - 2.2 * dt );
		// a trot even when not spurred, so every pass ends
		if ( this.speed < 2.5 ) this.speed = Math.min( 2.5, this.speed + 2 * dt );
		this.x += this.speed * dt;
		return this.speed;

	}

	stop( dt ) {

		this.speed = Math.max( 0, this.speed - 5 * dt );
		this.x += this.speed * dt;

	}

	get speedFrac() {

		return this.speed / 12.5;

	}

}

// the lance wavers with the gait: more at speed, less on a steady horse
export function sway( rider, time, seed = 0 ) {

	const g = Math.min( 1, rider.speed / 12 );
	const a = ( 0.03 + 0.11 * g ) * ( 1.3 - rider.horse.stats.steady );
	const f = 2 * ( 1.6 + rider.speed * 0.05 );
	return {
		h: a * ( Math.sin( time * 1.9 + seed ) * 0.7 + Math.sin( time * 4.3 + seed * 2 ) * 0.3 ),
		y: a * ( Math.sin( time * f * Math.PI + seed ) * 0.8 + Math.sin( time * 2.7 + seed * 3 ) * 0.2 ),
	};

}

// ---- bracing: press shortly before the lances meet

export const BRACE = { hold: 0.55, cooldown: 1.1, perfect: 0.22 };

// seconds between the press and the impact -> 0 (no brace) .. 1 (perfect)
export function braceQuality( secondsBefore ) {

	if ( secondsBefore === null || secondsBefore < 0 || secondsBefore > BRACE.hold ) return 0;
	return secondsBefore <= BRACE.perfect ? 1 : 0.6;

}

// ---- the strike

// attacker hits the defender at ( h, y ). Returns { zone, points, unhorsed, broke, centred, chance }.
export function resolveStrike( { h, y, attacker, defender, brace = 0, rng } ) {

	const { zone, centred } = zoneAt( h, y, brace );
	const Z = ZONES[ zone ];
	if ( zone === 'miss' ) return { zone, points: 0, unhorsed: false, broke: false, centred: 0, chance: 0 };
	const power = Math.pow( Math.min( 1.1, attacker.speedFrac ), 1.5 ) * 0.9 + 0.35;
	let chance = Z.unhorse * power * attacker.horse.stats.power * ( 1.3 - defender.horse.stats.steady * 0.55 ) * ( 1 - 0.65 * brace ) * ( 0.6 + 0.8 * centred );
	chance = Math.min( 0.85, Math.max( 0, chance ) );
	const unhorsed = rng() < chance;
	const broke = unhorsed || rng() < ( zone === 'shield' ? 0.7 : 0.9 );
	return { zone, points: Z.points, unhorsed, broke, centred, chance };

}

// ---- the opponent

// a plan for one pass: where to aim, how hard to ride, whether and when to brace
export function aiPlan( skill, rng ) {

	const r = rng();
	const target = r < 0.1 + 0.32 * skill ? 'helm' : r < 0.55 + 0.1 * skill ? 'body' : 'shield';
	const [ h0, y0 ] = ZONES[ target ].center;
	const err = 0.2 * ( 1 - skill ) + 0.035;
	return {
		target,
		h: h0 + gauss( rng ) * err,
		y: y0 + gauss( rng ) * err,
		spur: 0.72 + 0.28 * skill,
		brace: rng() < 0.2 + 0.72 * skill,
		// seconds before impact the AI raises the shield (good knights time it well)
		braceLead: Math.max( 0.02, 0.14 + gauss( rng ) * 0.22 * ( 1 - skill ) + ( rng() < 0.15 * ( 1 - skill ) ? 0.5 : 0 ) ),
	};

}

// ---- a bout: passes until someone leads after three, or falls

export class Bout {

	constructor() {

		this.passes = []; // { you: strike, them: strike }
		this.score = [ 0, 0 ];
		this.winner = null; // 'you' | 'them'
		this.unhorsed = null; // who fell
		this.clean = [ 0, 0 ]; // helm and body hits, the tie-break

	}

	get passNumber() {

		return this.passes.length + 1;

	}

	get over() {

		return this.winner !== null;

	}

	get suddenDeath() {

		return this.passes.length >= PASSES;

	}

	record( you, them ) {

		this.passes.push( { you, them } );
		this.score[ 0 ] += you.points;
		this.score[ 1 ] += them.points;
		if ( you.zone === 'helm' || you.zone === 'body' ) this.clean[ 0 ] ++;
		if ( them.zone === 'helm' || them.zone === 'body' ) this.clean[ 1 ] ++;
		const youFell = them.unhorsed, theyFell = you.unhorsed;
		if ( theyFell && ! youFell ) { this.winner = 'you'; this.unhorsed = 'them'; } else if ( youFell && ! theyFell ) { this.winner = 'them'; this.unhorsed = 'you'; } else if ( this.passes.length >= PASSES || ( youFell && theyFell ) ) {

			if ( youFell && theyFell ) this.unhorsed = 'both';
			if ( this.score[ 0 ] !== this.score[ 1 ] ) this.winner = this.score[ 0 ] > this.score[ 1 ] ? 'you' : 'them';
			else if ( this.passes.length >= MAX_PASSES ) this.winner = this.clean[ 1 ] > this.clean[ 0 ] ? 'them' : 'you';

		}

		return this.winner;

	}

}
