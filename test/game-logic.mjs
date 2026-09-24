// Plain-node tests of the joust rules (no GPU): zones, riding, strikes, the AI, bouts, the tournament.
import { zoneAt, Rider, resolveStrike, aiPlan, Bout, braceQuality, sway, LIST, maxSpeed, ZONES } from '../src/game/Joust.js';
import { Tournament, OPPONENTS } from '../src/game/Tournament.js';
import { HORSES, validKnight, DEFAULT_KNIGHT } from '../src/game/Options.js';
import { paintArms, randomArms, CHARGE_IDS } from '../src/game/Heraldry.js';
import { rng, gauss } from '../src/game/Rng.js';

let fails = 0;
const ok = ( c, msg ) => { if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg ); };

// ---- zones
ok( zoneAt( 0, 2.7 ).zone === 'helm', 'centre of the helm is a helm hit' );
ok( zoneAt( 0.3, 2.32 ).zone === 'shield', 'the shield covers the left side' );
ok( zoneAt( - 0.1, 2.1 ).zone === 'body', 'the right breast is open' );
ok( zoneAt( - 0.1, 2.1, 1 ).zone === 'shield', 'a braced shield covers the breast' );
ok( zoneAt( 0, 3.3 ).zone === 'miss' && zoneAt( 0.9, 2.2 ).zone === 'miss', 'wide and high points miss' );

// ---- riding
{
	const r = new Rider( HORSES.courser );
	let t = 0;
	while ( r.x < LIST.start - LIST.reach / 2 ) { r.step( 1 / 60, 1 ); t += 1 / 60; }
	ok( Math.abs( r.speed - maxSpeed( HORSES.courser ) ) < 0.3, `a spurred courser reaches full speed (${ r.speed.toFixed( 1 ) } m/s)` );
	ok( t > 3 && t < 6, `a charge lasts a few seconds (${ t.toFixed( 1 ) } s)` );
	const lazy = new Rider( HORSES.courser );
	for ( let i = 0; i < 600; i ++ ) lazy.step( 1 / 60, 0 );
	ok( lazy.speed >= 2.4 && lazy.speed < 5, 'an unspurred horse still trots on' );
	const d = new Rider( HORSES.destrier ), c = new Rider( HORSES.courser );
	for ( let i = 0; i < 60; i ++ ) { d.step( 1 / 60, 1 ); c.step( 1 / 60, 1 ); }
	ok( c.speed > d.speed, 'the courser starts quicker than the destrier' );
	const s1 = sway( Object.assign( new Rider( HORSES.courser ), { speed: 12 } ), 1.3 ), s2 = sway( Object.assign( new Rider( HORSES.andalusian ), { speed: 12 } ), 1.3 );
	ok( Math.hypot( s2.h, s2.y ) < Math.hypot( s1.h, s1.y ) + 1e-9, 'a steady horse sways less' );
}

// ---- bracing
ok( braceQuality( 0.1 ) === 1 && braceQuality( 0.4 ) === 0.6 && braceQuality( 0.9 ) === 0 && braceQuality( null ) === 0, 'brace timing windows' );

// ---- strikes
{
	const R = rng( 5 );
	const fast = Object.assign( new Rider( HORSES.destrier ), { speed: 11 } ), def = Object.assign( new Rider( HORSES.courser ), { speed: 11 } );
	let falls = 0, braced = 0;
	for ( let i = 0; i < 4000; i ++ ) {
		if ( resolveStrike( { h: 0, y: 2.7, attacker: fast, defender: def, rng: R } ).unhorsed ) falls ++;
		if ( resolveStrike( { h: 0, y: 2.7, attacker: fast, defender: def, brace: 1, rng: R } ).unhorsed ) braced ++;
	}
	ok( falls > 1000 && falls < 3000, `a fast helm strike often unhorses (${ ( falls / 40 ).toFixed( 0 ) }%)` );
	ok( braced < falls * 0.5, `bracing halves the risk (${ ( braced / 40 ).toFixed( 0 ) }%)` );
	const slow = Object.assign( new Rider( HORSES.destrier ), { speed: 3 } );
	let slowFalls = 0;
	for ( let i = 0; i < 4000; i ++ ) if ( resolveStrike( { h: 0, y: 2.7, attacker: slow, defender: def, rng: R } ).unhorsed ) slowFalls ++;
	ok( slowFalls < falls * 0.6, 'a slow strike unhorses less' );
	ok( resolveStrike( { h: 2, y: 2, attacker: fast, defender: def, rng: R } ).points === 0, 'a miss scores nothing' );
}

// ---- AI skill: good knights aim closer to the mark
{
	const hitRate = ( skill ) => {
		const R = rng( 11 );
		let hits = 0;
		for ( let i = 0; i < 3000; i ++ ) { const p = aiPlan( skill, R ); if ( zoneAt( p.h, p.y ).zone !== 'miss' ) hits ++; }
		return hits / 3000;
	};
	const lo = hitRate( 0.2 ), hi = hitRate( 0.92 );
	ok( hi > lo + 0.1, `skilled knights hit more (${ ( lo * 100 ).toFixed( 0 ) }% vs ${ ( hi * 100 ).toFixed( 0 ) }%)` );
}

// ---- bouts
{
	const b = new Bout();
	const hit = ( zone, unhorsed = false ) => ( { zone, points: ZONES[ zone ].points, unhorsed } );
	b.record( hit( 'body' ), hit( 'shield' ) );
	ok( ! b.over, 'a bout goes on after one pass' );
	b.record( hit( 'miss' ), hit( 'helm', true ) );
	ok( b.over && b.winner === 'them' && b.unhorsed === 'you', 'being unhorsed loses the bout' );
	const t = new Bout();
	for ( let i = 0; i < 3; i ++ ) t.record( hit( 'shield' ), hit( 'shield' ) );
	ok( ! t.over, 'a tie after three passes goes to sudden death' );
	t.record( hit( 'body' ), hit( 'shield' ) );
	ok( t.over && t.winner === 'you', 'sudden death decides it' );
	const m = new Bout();
	for ( let i = 0; i < 7; i ++ ) m.record( hit( 'shield' ), hit( 'shield' ) );
	ok( m.over, 'a bout always ends' );
}

// ---- a simulated tournament: a decent player (aims at the body, braces well) against every opponent
{
	const R = rng( 21 );
	const wins = OPPONENTS.map( ( o ) => {
		let w = 0;
		for ( let n = 0; n < 400; n ++ ) {
			const b = new Bout();
			const you = Object.assign( new Rider( HORSES.chestnut ), { speed: 11 } ), them = Object.assign( new Rider( HORSES[ o.horse ] ), { speed: 10 + o.skill * 2 } );
			while ( ! b.over ) {
				const p = aiPlan( o.skill, R );
				const mine = { h: 0.02 + gauss( R ) * 0.1, y: 2.19 + gauss( R ) * 0.1 };
				const a = resolveStrike( { ...mine, attacker: you, defender: them, brace: p.brace ? 0.6 : 0, rng: R } );
				const d = resolveStrike( { h: p.h, y: p.y, attacker: them, defender: you, brace: R() < 0.6 ? 1 : 0, rng: R } );
				b.record( a, d );
			}
			if ( b.winner === 'you' ) w ++;
		}
		return w / 400;
	} );
	console.log( '     win rate by opponent:', wins.map( ( w ) => ( w * 100 ).toFixed( 0 ) + '%' ).join( ' ' ) );
	ok( wins[ 0 ] > 0.7, 'the first opponent is beatable' );
	ok( wins[ 4 ] < wins[ 0 ] && wins[ 4 ] > 0.15, 'the champion is hard but not hopeless' );
}

// ---- tournament progress
{
	const t = new Tournament();
	ok( t.record( { won: true } ) === 'next' && t.round === 1, 'a win moves to the next round' );
	ok( t.record( { won: false } ) === 'retry' && t.round === 1, 'a loss can be ridden again' );
	t.record( { won: false } );
	ok( t.record( { won: false } ) === 'eliminated', 'three defeats end the tournament' );
	const c = new Tournament();
	for ( let i = 0; i < 4; i ++ ) c.record( { won: true } );
	ok( c.record( { won: true } ) === 'champion', 'five wins make a champion' );
}

// ---- options and heraldry
ok( validKnight( null ).horse === DEFAULT_KNIGHT.horse && validKnight( { horse: 'unicorn', name: '  ' } ).name === DEFAULT_KNIGHT.name, 'bad saved knights fall back to the defaults' );
{
	const px = paintArms( { division: 'perPale', field: [ 'gules', 'argent' ], charge: 'none', chargeTincture: 'or' }, 32 );
	ok( px[ ( 16 * 32 + 4 ) * 4 ] > 150 && px[ ( 16 * 32 + 4 ) * 4 + 1 ] < 60, 'per pale: gules on the dexter side' );
	ok( px[ ( 16 * 32 + 28 ) * 4 + 1 ] > 200, 'per pale: argent on the sinister side' );
	const R = rng( 2 );
	const all = new Set();
	for ( let i = 0; i < 200; i ++ ) { const a = randomArms( R ); all.add( a.charge ); }
	ok( all.size >= CHARGE_IDS.length - 2, 'random arms use many charges' );
}

console.log( fails ? `\n${ fails } FAILED` : '\nall passed' );
process.exit( fails ? 1 : 0 );
