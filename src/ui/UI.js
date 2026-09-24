import { paintArms, TINCTURES, TINCTURE_IDS, DIVISIONS, DIVISION_IDS, CHARGES, CHARGE_IDS, randomArms, cssOf } from '../game/Heraldry.js';
import { HORSES, HORSE_IDS, ARMOURS, ARMOUR_IDS, HELMS, HELM_IDS, PLUMES, PLUME_IDS, SKINS, HAIRS, BEARDS } from '../game/Options.js';
import { OPPONENTS, ROUND_NAMES, MAX_DEFEATS } from '../game/Tournament.js';
import { ZONES } from '../game/Joust.js';

// DOM overlay: the loader, every menu screen and the joust HUD. The App calls in; buttons call back.

const hex = ( n ) => '#' + n.toString( 16 ).padStart( 6, '0' );
const esc = ( s ) => String( s ).replace( /[&<>"']/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[ c ] ) );

// a painted shield as a data URL (cached)
const _shieldCache = new Map();
export function shieldURL( arms, size = 96 ) {

	const key = JSON.stringify( arms ) + size;
	let url = _shieldCache.get( key );
	if ( url ) return url;
	const px = paintArms( arms, size, { shield: true, ss: 2 } );
	const c = document.createElement( 'canvas' );
	c.width = c.height = size;
	c.getContext( '2d' ).putImageData( new ImageData( new Uint8ClampedArray( px.buffer ), size, size ), 0, 0 );
	url = c.toDataURL();
	if ( _shieldCache.size > 400 ) _shieldCache.clear();
	_shieldCache.set( key, url );
	return url;

}

export class UI {

	constructor() {

		this.root = document.getElementById( 'ui' );
		this.loader = document.getElementById( 'loader' );
		this.hud = null;

	}

	// ------------------------------------------------------------------ loader

	setLoading( p, text ) {

		this.loader.querySelector( '.loader-fill' ).style.width = `${ Math.round( p * 100 ) }%`;
		if ( text ) this.loader.querySelector( '.loader-status' ).textContent = text;

	}

	setLoadingError( msg ) {

		const s = this.loader.querySelector( '.loader-status' );
		s.textContent = /webgpu/i.test( msg ) ? `${ msg } Please try a recent Chrome, Edge or Safari.` : `Something went wrong: ${ msg }`;
		s.classList.add( 'loader-error' );

	}

	hideLoader() {

		this.loader.classList.add( 'hidden' );
		return new Promise( ( r ) => setTimeout( r, 500 ) );

	}

	// ------------------------------------------------------------------ helpers

	clear() {

		this.root.innerHTML = '';
		this.hud = null;
		this.addCorner();

	}

	el( html ) {

		const t = document.createElement( 'template' );
		t.innerHTML = html.trim();
		return t.content.firstElementChild;

	}

	mount( html ) {

		const e = this.el( html );
		this.root.appendChild( e );
		return e;

	}

	// the mute button, always in the top right
	addCorner() {

		const b = this.mount( `<button class="corner-btn" title="Sound (M)" aria-label="Toggle sound">${ this.muted ? '🔇' : '🔊' }</button>` );
		b.onclick = () => this.onMute && this.onMute();

	}

	setMuted( m ) {

		this.muted = m;
		const b = this.root.querySelector( '.corner-btn' );
		if ( b ) b.textContent = m ? '🔇' : '🔊';

	}

	// ------------------------------------------------------------------ title

	showTitle( { onStart, hasSave } ) {

		this.clear();
		const s = this.mount( `
			<div class="screen title-screen">
				<p class="kicker">A tournament of arms</p>
				<h1 class="title">Jousting</h1>
				<p class="tagline">Five champions stand between you and the laurels. Lower your lance.</p>
				<div class="btns"><button class="btn gold" data-a="start">${ hasSave ? 'Enter the Lists' : 'Make your Knight' }</button></div>
				<p class="hint">Mouse to aim · <kbd>W</kbd> to spur · <kbd>Space</kbd> to brace</p>
			</div>` );
		s.querySelector( '[data-a=start]' ).onclick = onStart;

	}

	// ------------------------------------------------------------------ customise

	showCustomize( knight, { onChange, onDone, onBack, onTab } ) {

		this.clear();
		const tabs = [ [ 'horse', 'Horse' ], [ 'arms', 'Arms' ], [ 'armour', 'Armour' ], [ 'knight', 'Knight' ] ];
		const s = this.mount( `
			<div class="screen custom-screen">
				<div class="panel custom-panel">
					<h2>Arm your Knight</h2>
					<p class="sub">Choose a steed, your colours and your harness.</p>
					<div class="tabs" role="tablist">${ tabs.map( ( [ id, n ] ) => `<button class="tab" role="tab" data-tab="${ id }">${ n }</button>` ).join( '' ) }</div>
					<div class="tab-body"></div>
					<div class="custom-foot">
						<button class="btn quiet" data-a="back">Back</button>
						<button class="btn gold" data-a="done">To the Lists ›</button>
					</div>
				</div>
				<div class="custom-name passthrough"><img class="custom-shield" alt="" /><div><div class="cn-name"></div><div class="cn-horse"></div></div></div>
				<p class="drag-hint passthrough">Drag to turn your knight</p>
			</div>` );
		const body = s.querySelector( '.tab-body' );
		let tab = this._tab || 'horse';

		const change = ( patch ) => {

			Object.assign( knight, patch );
			onChange( knight );
			render();

		};

		const swatches = ( list, current, attr ) => `<div class="swatches">${ list.map( ( [ v, color, name ] ) =>
			`<button class="swatch ${ v === current ? 'on' : '' }" style="--c:${ color }" data-${ attr }="${ v }" title="${ esc( name ) }" aria-label="${ esc( name ) }"></button>` ).join( '' ) }</div>`;

		const tinctures = ( current, attr ) => swatches( TINCTURE_IDS.map( ( t ) => [ t, cssOf( t ), TINCTURES[ t ].name ] ), current, attr );

		const render = () => {

			s.querySelectorAll( '.tab' ).forEach( ( b ) => b.classList.toggle( 'on', b.dataset.tab === tab ) );
			s.querySelector( '.custom-shield' ).src = shieldURL( knight.arms, 72 );
			s.querySelector( '.cn-name' ).textContent = knight.name;
			s.querySelector( '.cn-horse' ).textContent = `on ${ HORSES[ knight.horse ].name }, ${ HORSES[ knight.horse ].breed.toLowerCase() }`;
			const a = knight.arms;
			if ( tab === 'horse' ) {

				body.innerHTML = `<div class="cards">${ HORSE_IDS.map( ( id ) => {

					const h = HORSES[ id ];
					const bar = ( n, v ) => `<div class="stat"><span>${ n }</span><i style="--v:${ Math.min( 1, v ) }"></i></div>`;
					return `<button class="card ${ id === knight.horse ? 'on' : '' }" data-horse="${ id }">
						<span class="coat" style="--c:${ hex( h.coat ) };--m:${ hex( h.mane ) }"></span>
						<span class="card-title">${ h.name } <small>${ h.breed }</small></span>
						<span class="card-blurb">${ h.blurb }</span>
						<span class="stats">${ bar( 'Speed', h.stats.speed ) }${ bar( 'Start', h.stats.accel ) }${ bar( 'Power', h.stats.power / 1.15 ) }${ bar( 'Steady', h.stats.steady ) }</span>
					</button>`;

				} ).join( '' ) }</div>`;

			} else if ( tab === 'arms' ) {

				const mini = ( patch ) => shieldURL( { ...a, ...patch }, 56 );
				body.innerHTML = `
					<div class="row-label">Field</div>
					<div class="shield-grid">${ DIVISION_IDS.map( ( d ) => `<button class="mini ${ d === a.division ? 'on' : '' }" data-division="${ d }" title="${ DIVISIONS[ d ].name }"><img src="${ mini( { division: d, charge: 'none' } ) }" alt="${ DIVISIONS[ d ].name }" /></button>` ).join( '' ) }</div>
					<div class="two-col"><div><div class="row-label">First tincture</div>${ tinctures( a.field[ 0 ], 'f0' ) }</div><div><div class="row-label">Second tincture</div>${ tinctures( a.field[ 1 ], 'f1' ) }</div></div>
					<div class="row-label">Charge</div>
					<div class="shield-grid">${ CHARGE_IDS.map( ( c ) => `<button class="mini ${ c === a.charge ? 'on' : '' }" data-charge="${ c }" title="${ CHARGES[ c ].name }"><img src="${ mini( { charge: c } ) }" alt="${ CHARGES[ c ].name }" /></button>` ).join( '' ) }</div>
					<div class="row-label">Charge tincture</div>${ tinctures( a.chargeTincture, 'ct' ) }
					<button class="btn quiet small" data-a="random">Random arms</button>`;

			} else if ( tab === 'armour' ) {

				body.innerHTML = `
					<div class="row-label">Harness</div>
					${ swatches( ARMOUR_IDS.map( ( id ) => [ id, `linear-gradient(135deg, ${ hex( ARMOURS[ id ].color ) }, #ffffff55 45%, ${ hex( ARMOURS[ id ].color ) })`, ARMOURS[ id ].name ] ), knight.armour, 'armour' ) }
					<div class="picked">${ ARMOURS[ knight.armour ].name }</div>
					<div class="row-label">Helm</div>
					<div class="chips">${ HELM_IDS.map( ( id ) => `<button class="chip ${ id === knight.helm ? 'on' : '' }" data-helm="${ id }">${ HELMS[ id ].name }</button>` ).join( '' ) }</div>
					<div class="row-label">Plume</div>
					${ swatches( PLUME_IDS.map( ( id ) => [ id, PLUMES[ id ].color === null ? 'repeating-linear-gradient(45deg,#d9c59a 0 4px,#b9a57a 4px 8px)' : hex( PLUMES[ id ].color ), PLUMES[ id ].name ] ), knight.plume, 'plume' ) }`;

			} else {

				body.innerHTML = `
					<label class="row-label" for="kname">Name</label>
					<input id="kname" class="name-input" maxlength="28" value="${ esc( knight.name ) }" />
					<div class="row-label">Face</div>
					${ swatches( SKINS.map( ( c, i ) => [ i, hex( c ), 'Skin ' + ( i + 1 ) ] ), knight.skin, 'skin' ) }
					<div class="row-label">Hair</div>
					${ swatches( HAIRS.map( ( h, i ) => [ i, hex( h.c ), h.name ] ), knight.hair, 'hair' ) }
					<div class="row-label">Beard</div>
					<div class="chips">${ BEARDS.map( ( b, i ) => `<button class="chip ${ i === knight.beard ? 'on' : '' }" data-beard="${ i }">${ b }</button>` ).join( '' ) }</div>`;
				const inp = body.querySelector( '#kname' );
				inp.oninput = () => { knight.name = inp.value.trim() || 'Sir Nameless'; onChange( knight ); s.querySelector( '.cn-name' ).textContent = knight.name; };

			}

		};

		s.addEventListener( 'click', ( e ) => {

			const b = e.target.closest( 'button' );
			if ( ! b ) return;
			const d = b.dataset;
			if ( d.tab ) { tab = this._tab = d.tab; onTab( tab ); render(); }
			else if ( d.horse ) change( { horse: d.horse } );
			else if ( d.division ) change( { arms: { ...knight.arms, division: d.division } } );
			else if ( d.charge ) change( { arms: { ...knight.arms, charge: d.charge } } );
			else if ( d.f0 ) change( { arms: { ...knight.arms, field: [ d.f0, knight.arms.field[ 1 ] ] } } );
			else if ( d.f1 ) change( { arms: { ...knight.arms, field: [ knight.arms.field[ 0 ], d.f1 ] } } );
			else if ( d.ct ) change( { arms: { ...knight.arms, chargeTincture: d.ct } } );
			else if ( d.armour ) change( { armour: d.armour } );
			else if ( d.helm ) change( { helm: d.helm } );
			else if ( d.plume ) change( { plume: d.plume } );
			else if ( d.skin !== undefined ) change( { skin: + d.skin } );
			else if ( d.hair !== undefined ) change( { hair: + d.hair } );
			else if ( d.beard !== undefined ) change( { beard: + d.beard } );
			else if ( d.a === 'random' ) change( { arms: randomArms() } );
			else if ( d.a === 'done' ) onDone();
			else if ( d.a === 'back' ) onBack();

		} );
		onTab( tab );
		render();

	}

	// ------------------------------------------------------------------ the herald: bracket and next opponent

	showBracket( t, player, { onRide, onCustomize } ) {

		this.clear();
		const o = t.opponent;
		const s = this.mount( `
			<div class="screen bracket-screen">
				<div class="panel bracket-panel">
					<p class="kicker dark">${ ROUND_NAMES[ t.round ] }</p>
					<h2>${ esc( o.name ) } <span class="title-small">${ esc( o.title ) }</span></h2>
					<div class="versus">
						<figure><img src="${ shieldURL( player.arms, 96 ) }" alt="Your arms" /><figcaption>${ esc( player.name ) }</figcaption></figure>
						<span class="vs">against</span>
						<figure><img src="${ shieldURL( o.arms, 96 ) }" alt="${ esc( o.name ) }'s arms" /><figcaption>${ esc( o.name ) }</figcaption></figure>
					</div>
					<p class="intro">${ esc( o.intro ) }</p>
					<blockquote>“${ esc( o.taunt ) }”</blockquote>
					<p class="rules">Three passes. <b>Helm</b> scores 3, <b>breastplate</b> 2, <b>shield</b> 1. Unhorse your foe to win at once.</p>
					<ol class="ladder">${ OPPONENTS.map( ( q, i ) => `<li class="${ i < t.round ? 'done' : i === t.round ? 'now' : '' }"><img src="${ shieldURL( q.arms, 40 ) }" alt="" /><span>${ esc( q.name ) }</span></li>` ).join( '' ) }</ol>
					<p class="lives">${ t.defeats ? `Defeats: ${ t.defeats } of ${ MAX_DEFEATS }` : 'Unbeaten' }</p>
					<div class="custom-foot">
						<button class="btn quiet" data-a="custom">Change arms</button>
						<button class="btn gold" data-a="ride">Take your place</button>
					</div>
				</div>
			</div>` );
		s.querySelector( '[data-a=ride]' ).onclick = onRide;
		s.querySelector( '[data-a=custom]' ).onclick = onCustomize;

	}

	// ------------------------------------------------------------------ the joust HUD

	showHUD( player, opponent ) {

		this.clear();
		const h = this.mount( `
			<div class="hud passthrough">
				<div class="scoreboard">
					<div class="side you"><img src="${ shieldURL( player.arms, 56 ) }" alt="" /><div><div class="who">${ esc( player.name ) }</div><div class="pts">0</div></div></div>
					<div class="pass"><div class="pass-n">Pass 1</div><div class="dots"></div></div>
					<div class="side them"><div><div class="who">${ esc( opponent.name ) }</div><div class="pts">0</div></div><img src="${ shieldURL( opponent.arms, 56 ) }" alt="" /></div>
				</div>
				<div class="reticle"><div class="ring"></div><div class="zone-label"></div></div>
				<div class="banner"></div>
				<div class="popups"></div>
				<div class="gauges">
					<div class="gauge speed"><span>Speed</span><i></i></div>
					<div class="gauge brace"><span>Shield</span><i></i></div>
				</div>
				<div class="controls"></div>
			</div>` );
		this.hud = {
			root: h,
			ptsYou: h.querySelector( '.you .pts' ),
			ptsThem: h.querySelector( '.them .pts' ),
			passN: h.querySelector( '.pass-n' ),
			dots: h.querySelector( '.dots' ),
			reticle: h.querySelector( '.reticle' ),
			zone: h.querySelector( '.zone-label' ),
			banner: h.querySelector( '.banner' ),
			popups: h.querySelector( '.popups' ),
			speed: h.querySelector( '.speed i' ),
			brace: h.querySelector( '.brace i' ),
			controls: h.querySelector( '.controls' ),
		};

	}

	// `ridden`: the pass just run is still on screen (show its number, not the next one)
	setScore( bout, ridden = false ) {

		if ( ! this.hud ) return;
		this.hud.ptsYou.textContent = bout.score[ 0 ];
		this.hud.ptsThem.textContent = bout.score[ 1 ];
		const n = bout.passNumber - ( ridden ? 1 : 0 );
		this.hud.passN.textContent = n > 3 ? `Sudden death · Pass ${ n }` : `Pass ${ n } of 3`;
		this.hud.dots.innerHTML = bout.passes.map( ( p ) => `<span class="dot" title="${ ZONES[ p.you.zone ].name } / ${ ZONES[ p.them.zone ].name }">${ p.you.points }–${ p.them.points }</span>` ).join( '' );

	}

	setControls( html ) {

		if ( this.hud ) this.hud.controls.innerHTML = html;

	}

	setGauges( speed, brace ) {

		if ( ! this.hud ) return;
		this.hud.speed.style.setProperty( '--v', speed.toFixed( 3 ) );
		this.hud.brace.style.setProperty( '--v', brace.toFixed( 3 ) );
		this.hud.brace.parentElement.classList.toggle( 'up', brace > 0 );

	}

	setReticle( visible, x, y, zone ) {

		if ( ! this.hud ) return;
		const r = this.hud.reticle;
		r.style.display = visible ? 'block' : 'none';
		if ( ! visible ) return;
		r.style.transform = `translate(${ x }px, ${ y }px)`;
		r.dataset.zone = zone;
		this.hud.zone.textContent = ZONES[ zone ].name;

	}

	banner( html, kind = '' ) {

		if ( ! this.hud ) return;
		const b = this.hud.banner;
		b.className = 'banner show ' + kind;
		b.innerHTML = html;

	}

	hideBanner() {

		if ( this.hud ) this.hud.banner.className = 'banner';

	}

	popup( text, kind = '', side = 'you' ) {

		if ( ! this.hud ) return;
		const p = this.el( `<div class="popup ${ kind } ${ side }">${ text }</div>` );
		this.hud.popups.appendChild( p );
		setTimeout( () => p.remove(), 2600 );

	}

	// ------------------------------------------------------------------ results

	showBoutResult( { won, bout, opponent, outcome, defeats }, { onNext, onRetry, onQuit } ) {

		this.clear();
		const reason = bout.unhorsed === 'them' ? `${ esc( opponent.name ) } is thrown from the saddle!` : bout.unhorsed === 'you' ? 'You are thrown from the saddle.' : `${ bout.score[ 0 ]} to ${ bout.score[ 1 ]} on points.`;
		const lines = bout.passes.map( ( p, i ) => `<tr><td>Pass ${ i + 1 }</td><td>${ ZONES[ p.you.zone ].name }${ p.you.unhorsed ? ' · unhorsed!' : '' }</td><td>${ p.you.points }</td><td>${ p.them.points }</td><td>${ ZONES[ p.them.zone ].name }${ p.them.unhorsed ? ' · unhorsed!' : '' }</td></tr>` ).join( '' );
		const s = this.mount( `
			<div class="screen result-screen">
				<div class="panel result-panel ${ won ? 'won' : 'lost' }">
					<h2>${ won ? 'Victory!' : 'Defeat' }</h2>
					<p class="sub">${ reason }</p>
					<table class="passes"><thead><tr><th></th><th>Your lance</th><th>You</th><th>Them</th><th>Their lance</th></tr></thead><tbody>${ lines }</tbody></table>
					<blockquote>“${ esc( won ? opponent.defeated : opponent.taunt ) }”</blockquote>
					${ ! won && outcome === 'retry' ? `<p class="lives">The herald allows you ${ MAX_DEFEATS - defeats } more ${ MAX_DEFEATS - defeats === 1 ? 'try' : 'tries' }.</p>` : '' }
					<div class="custom-foot">
						${ outcome === 'eliminated' ? '<button class="btn gold" data-a="quit">Leave the tournament</button>' : '' }
						${ outcome === 'retry' ? '<button class="btn quiet" data-a="quit">Withdraw</button><button class="btn gold" data-a="retry">Ride again</button>' : '' }
						${ outcome === 'next' ? '<button class="btn gold" data-a="next">To the next bout</button>' : '' }
					</div>
				</div>
			</div>` );
		s.addEventListener( 'click', ( e ) => {

			const a = e.target.closest( 'button' )?.dataset.a;
			if ( a === 'next' ) onNext();
			if ( a === 'retry' ) onRetry();
			if ( a === 'quit' ) onQuit();

		} );

	}

	showChampion( player, t, { onAgain } ) {

		this.clear();
		const passes = t.results.length;
		const s = this.mount( `
			<div class="screen champion-screen">
				<div class="champion-top passthrough">
					<p class="kicker">Hear ye, hear ye</p>
					<h1 class="title">Champion</h1>
					<p class="tagline">${ esc( player.name ) } has won the tournament and the King's laurels!</p>
				</div>
				<div class="champion-bottom">
					<img src="${ shieldURL( player.arms, 80 ) }" alt="" />
					<p>Five champions faced, ${ t.defeats ? `${ t.defeats } ${ t.defeats === 1 ? 'defeat' : 'defeats' } along the way` : 'not a single defeat' }, ${ passes } ${ passes === 1 ? 'bout' : 'bouts' } ridden.</p>
					<button class="btn gold" data-a="again">A new tournament</button>
				</div>
			</div>` );
		s.querySelector( '[data-a=again]' ).onclick = onAgain;

	}

	showEliminated( { onAgain } ) {

		this.clear();
		const s = this.mount( `
			<div class="screen result-screen">
				<div class="panel result-panel lost">
					<h2>Sent Home</h2>
					<p class="sub">Three defeats, and the herald strikes your name from the rolls. There will be other tournaments.</p>
					<div class="custom-foot"><button class="btn gold" data-a="again">Try again</button></div>
				</div>
			</div>` );
		s.querySelector( '[data-a=again]' ).onclick = onAgain;

	}

	showPause( { onResume, onQuit } ) {

		const s = this.mount( `
			<div class="screen pause-screen">
				<div class="panel result-panel">
					<h2>Paused</h2>
					<p class="sub">Aim with the mouse (or the arrow keys). Hold <kbd>W</kbd> or <kbd>Shift</kbd> to spur. Press <kbd>Space</kbd> or right-click just before the lances meet to brace your shield.</p>
					<div class="custom-foot"><button class="btn quiet" data-a="quit">Quit the bout</button><button class="btn gold" data-a="resume">Resume</button></div>
				</div>
			</div>` );
		s.querySelector( '[data-a=resume]' ).onclick = () => { s.remove(); onResume(); };
		s.querySelector( '[data-a=quit]' ).onclick = () => { s.remove(); onQuit(); };
		return s;

	}

}
