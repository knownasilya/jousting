import { GPU, G } from './engine/webgpu.js';
import { Engine } from './engine/Engine.js';
import { Vector3, MathUtils } from './engine/index.js';
import { Renderer } from './core/Renderer.js';
import { loadEnvironment } from './world/Environment.js';
import { Input } from './core/Input.js';
import { Arena } from './world/Arena.js';
import { Knight } from './world/Knight.js';
import { setAtlasArms, SLOT } from './world/Materials.js';
import { Particles } from './fx/Particles.js';
import { Sound } from './audio/Sound.js';
import { rgbOf } from './game/Heraldry.js';
import { HORSES, validKnight } from './game/Options.js';
import { Tournament, OPPONENTS, ROYAL_ARMS } from './game/Tournament.js';
import { LIST, ZONES, Rider, Bout, sway, zoneAt, resolveStrike, aiPlan, braceQuality, BRACE } from './game/Joust.js';
import { rng } from './game/Rng.js';

// The game: menus, the tournament and the joust itself. States:
//   title -> customize -> bracket -> joust ( ready -> charge -> after ) -> result -> bracket ... -> champion

const SAVE_KEY = 'jousting.knight.v1';
const _v = new Vector3(), _w = new Vector3();
const hexOf = ( id ) => ( rgbOf( id )[ 0 ] << 16 ) | ( rgbOf( id )[ 1 ] << 8 ) | rgbOf( id )[ 2 ];

function loadKnight() {

	try { return validKnight( JSON.parse( localStorage.getItem( SAVE_KEY ) ) ); } catch ( e ) { return validKnight( null ); }

}

function saveKnight( k ) {

	try { localStorage.setItem( SAVE_KEY, JSON.stringify( k ) ); } catch ( e ) { /* private mode: not saved */ }

}

export class App {

	constructor( container, ui ) {

		this.container = container;
		this.ui = ui;
		this.time = 0; // game time (slows in the moment of impact)
		this.realTime = 0;
		this.timeScale = 1;
		this.state = 'loading';
		this.rand = rng( ( Date.now() & 0xffff ) + 1 );
		this.cam = { pos: new Vector3( 30, 12, 30 ), look: new Vector3( 0, 2, 0 ), rate: 2, fov: 55 };
		this.shake = 0;
		this.fade = { value: 0, target: 0, speed: 3, then: null };
		this.excite = 0.25;
		this.hadSave = false;

	}

	async init( progress ) {

		progress( 0.05, 'Waking the heralds…' );
		this.engine = new Engine( this.container );
		this.maxScale = Math.min( window.devicePixelRatio || 1, 2 );
		this.engine.renderScale = this.maxScale;
		this.perf = { t: 0, frames: 0 };
		await this.engine.init();
		this.camera = this.engine.camera;
		this.camera.near = 0.1;
		this.camera.far = 4000;
		this.camera.fov = 55;
		this.camera.updateProjectionMatrix();
		this.scene = this.engine.scene;
		this.renderer = new Renderer();
		const resize = () => this.renderer.setSize( this.engine.width, this.engine.height );
		this.engine.onResize.push( resize );
		resize();
		this.input = new Input( this.engine.canvas );
		this.sound = new Sound();

		progress( 0.12, 'Reading the sky…' );
		try {

			G.horizonColor.value.copy( ( await loadEnvironment() ).horizon );

		} catch ( e ) {

			console.warn( 'Sky panorama not loaded, using a plain sky:', e.message );

		}

		progress( 0.2, 'Painting the banners…' );
		try { this.hadSave = !! localStorage.getItem( SAVE_KEY ); } catch ( e ) { /* no storage */ }
		this.knight = loadKnight();
		setAtlasArms( SLOT.player, this.knight.arms );
		for ( const o of OPPONENTS ) setAtlasArms( o.slot, o.arms );
		setAtlasArms( 7, ROYAL_ARMS );

		progress( 0.35, 'Raising the stands…' );
		this.arena = new Arena( { houses: [ 1, 2, 3, 4, 5, 7 ] } );
		this.scene.add( this.arena.group );

		progress( 0.5, 'Saddling the horses…' );
		this.player = new Knight( this.knight, SLOT.player );
		this.foe = new Knight( OPPONENTS[ 0 ], OPPONENTS[ 0 ].slot );
		for ( const k of [ this.player, this.foe ] ) this.scene.add( k.group, k.lance );
		this.particles = new Particles( this.scene );

		progress( 0.65, 'Forging the shaders…' );
		// draw everything once (every helm too) so all pipelines compile now, not mid-game
		for ( const k of [ this.player, this.foe ] ) { for ( const h in k.helms ) k.helms[ h ].visible = true; k.face.visible = true; k.blaze.visible = true; }
		this.placeTitle();
		this.camera.position.set( 0, 4, 14 );
		this.camera.lookAt( 0, 2, 0 );
		this.renderFrame();
		await GPU.pipelinesReady();
		this.player.apply( this.knight );
		this.foe.apply( OPPONENTS[ 0 ] );
		progress( 1, 'The lists are ready' );

		this.ui.onMute = () => this.ui.setMuted( this.sound.toggleMute() );
		window.addEventListener( 'keydown', ( e ) => {

			if ( e.target instanceof HTMLInputElement ) return;
			if ( e.code === 'KeyM' ) this.ui.onMute();
			if ( e.code === 'Escape' && this.state === 'joust' && ! this.paused ) this.pause();

		} );
		document.addEventListener( 'pointerlockchange', () => {

			// Esc during a charge releases the mouse first: treat that as a pause too
			if ( ! document.pointerLockElement && this.state === 'joust' && this.phase === 'charge' && ! this.paused ) this.pause();

		} );

	}

	start() {

		this.showTitle();
		this.engine.start( ( dt ) => this.update( dt ) );

	}

	// ------------------------------------------------------------------ screens

	showTitle() {

		this.state = 'title';
		this.placeTitle();
		this.ui.showTitle( { hasSave: this.hadSave, onStart: () => {

			this.sound.resume();
			this.sound.click();
			this.showCustomize();

		} } );

	}

	placeTitle() {

		const p = this.player, f = this.foe;
		p.remount(); f.remount();
		p.group.visible = f.group.visible = p.lance.visible = f.lance.visible = true;
		p.group.position.set( - 7, 0, LIST.lane ); p.group.rotation.y = 0;
		f.group.position.set( 7, 0, - LIST.lane ); f.group.rotation.y = Math.PI;
		p.speed = f.speed = 0; p.lanceAim = f.lanceAim = null; p.victory = f.victory = 0;
		p.resetLance(); f.resetLance();
		if ( p.helmOff ) p.setHelmOff( false );

	}

	showCustomize() {

		this.state = 'customize';
		this.turn = - 0.5;
		const p = this.player;
		p.remount();
		p.resetLance();
		p.group.position.set( - 20, 0, 5 );
		p.group.rotation.y = this.turn;
		p.speed = 0; p.lanceAim = null; p.victory = 0;
		this.foe.group.visible = this.foe.lance.visible = false;
		this.ui.showCustomize( this.knight, {
			onChange: ( k ) => {

				this.sound.click();
				this.knight = validKnight( k );
				Object.assign( k, this.knight );
				setAtlasArms( SLOT.player, this.knight.arms );
				p.apply( this.knight );
				saveKnight( this.knight );
				this.hadSave = true;

			},
			onTab: ( tab ) => {

				this.customTab = tab;
				p.setHelmOff( tab === 'knight' );
				p.lance.visible = tab !== 'knight'; // it would cross the face
				// wrap the turntable angle so the face close-up swings the short way round
				this.turn = MathUtils.euclideanModulo( this.turn + 1.2 + Math.PI, Math.PI * 2 ) - Math.PI - 1.2;

			},
			onDone: () => { this.sound.click(); p.setHelmOff( false ); this.customTab = null; saveKnight( this.knight ); this.hadSave = true; if ( ! this.tournament ) this.tournament = new Tournament(); this.showBracket(); },
			onBack: () => { this.sound.click(); p.setHelmOff( false ); this.customTab = null; this.showTitle(); },
		} );

	}

	showBracket() {

		this.state = 'bracket';
		const o = this.tournament.opponent;
		this.setupFoe( o );
		const f = this.foe, p = this.player;
		f.group.visible = f.lance.visible = p.lance.visible = true;
		f.group.position.set( 26, 0, - LIST.lane ); f.group.rotation.y = Math.PI;
		p.group.position.set( - 26, 0, LIST.lane ); p.group.rotation.y = 0;
		f.speed = p.speed = 0; f.lanceAim = p.lanceAim = null;
		this.bracketT = 0;
		this.ui.showBracket( this.tournament, this.knight, {
			onRide: () => { this.sound.resume(); this.sound.click(); this.startBout(); },
			onCustomize: () => { this.sound.click(); this.showCustomize(); },
		} );

	}

	setupFoe( o ) {

		this.foe.remount();
		this.foe.resetLance();
		this.foe.setSlot( o.slot );
		this.foe.apply( o );

	}

	// ------------------------------------------------------------------ the bout

	startBout() {

		this.state = 'joust';
		this.opponent = this.tournament.opponent;
		this.bout = new Bout();
		this.setupFoe( this.opponent );
		this.ui.showHUD( this.knight, this.opponent );
		this.ui.setScore( this.bout );
		this.fade.value = 1;
		this.resetPass();

	}

	resetPass() {

		const p = this.player, f = this.foe;
		p.remount(); f.remount();
		p.resetLance(); f.resetLance();
		p.group.visible = f.group.visible = p.lance.visible = f.lance.visible = true;
		p.group.rotation.y = 0; f.group.rotation.y = Math.PI;
		this.pr = new Rider( HORSES[ this.knight.horse ] );
		this.or = new Rider( HORSES[ this.opponent.horse ] );
		this.plan = aiPlan( this.opponent.skill, this.rand );
		this.aim = { h: 0.1, y: 2.24 };
		this.braceAt = null;
		this.aiBraceAt = null;
		this.impactDone = false;
		this.phase = 'ready';
		this.phaseT = 0;
		this.timeScale = 1;
		this.foeDelay = 0.15 + this.rand() * 0.35;
		p.lanceAim = f.lanceAim = null;
		p.lanceLower = f.lanceLower = 0;
		p.shieldBrace = f.shieldBrace = 0;
		this.placeRiders();
		this.snapCamera();
		this.fadeTo( 0, 2 );
		this.sound.trumpet();
		const n = this.bout.passNumber;
		this.ui.setScore( this.bout );
		this.ui.banner( n > 3 ? `Sudden Death<small>The scores are level. Ride again!</small>` : `Pass ${ n }<small>Hold <kbd>W</kbd> or the left mouse button to charge</small>` );
		this.ui.setControls( `<div><kbd>W</kbd> / hold click · spur</div><div>Mouse / arrows · aim</div><div><kbd>Space</kbd> / right-click · brace</div><div><kbd>Esc</kbd> · pause</div>` );

	}

	placeRiders() {

		this.player.group.position.set( - LIST.start + this.pr.x, 0, LIST.lane );
		this.foe.group.position.set( LIST.start - this.or.x, 0, - LIST.lane );
		this.player.speed = this.pr.speed;
		this.foe.speed = this.or.speed;

	}

	pause() {

		this.paused = true;
		this.input.unlock();
		this.ui.showPause( {
			onResume: () => { this.paused = false; if ( this.phase === 'charge' ) this.input.lock(); },
			onQuit: () => { this.paused = false; this.fadeTo( 1, 3, () => { this.fade.target = 0; this.showBracket(); } ); },
		} );

	}

	updateJoust( dt ) {

		const inp = this.input, p = this.player, f = this.foe;
		const gdt = dt * this.timeScale;
		this.phaseT += dt;

		if ( this.phase === 'ready' ) {

			inp.takeMouse();
			if ( inp.held( 'KeyW', 'ShiftLeft', 'ShiftRight', 'ArrowUp' ) || inp.pressed( 'Mouse0' ) ) {

				this.phase = 'charge';
				this.phaseT = 0;
				this.ui.hideBanner();
				inp.lock();

			}

		}

		if ( this.phase === 'charge' ) {

			const spur = inp.held( 'KeyW', 'ShiftLeft', 'ShiftRight' ) || inp.mouseDown ? 1 : 0;
			this.pr.step( gdt, spur );
			if ( this.phaseT > this.foeDelay ) this.or.step( gdt, this.plan.spur ); else this.or.stop( gdt );

		} else if ( this.phase === 'after' ) {

			this.pr.stop( gdt * 0.6 );
			this.or.stop( gdt * 0.6 );

		}

		this.placeRiders();
		const gap = f.group.position.x - p.group.position.x;

		// aim: the mouse moves the point on the opponent the lance is levelled at
		if ( this.phase === 'charge' ) {

			const m = inp.takeMouse();
			const k = 0.0021;
			this.aim.h += m.x * k;
			this.aim.y -= m.y * k;
			if ( inp.held( 'ArrowLeft', 'KeyA' ) ) this.aim.h -= 0.9 * dt;
			if ( inp.held( 'ArrowRight', 'KeyD' ) ) this.aim.h += 0.9 * dt;
			if ( inp.held( 'ArrowUp' ) ) this.aim.y += 0.9 * dt;
			if ( inp.held( 'ArrowDown', 'KeyS' ) ) this.aim.y -= 0.9 * dt;
			this.aim.h = MathUtils.clamp( this.aim.h, - 0.7, 1.0 );
			this.aim.y = MathUtils.clamp( this.aim.y, 1.4, 3.2 );

			if ( inp.pressed( 'Space', 'Mouse2' ) && ( this.braceAt === null || this.time - this.braceAt > BRACE.cooldown ) ) this.braceAt = this.time;

			const tti = ( gap - LIST.reach ) / Math.max( 1, this.pr.speed + this.or.speed );
			if ( this.plan.brace && this.aiBraceAt === null && tti <= this.plan.braceLead ) this.aiBraceAt = this.time;

		}

		const sw = sway( this.pr, this.time, 0 ), swo = sway( this.or, this.time, 3.7 );
		this.aimNow = { h: this.aim.h + sw.h, y: this.aim.y + sw.y };
		const lower = gap < LIST.lowerAt && ! this.impactDone;
		p.lanceAim = lower ? new Vector3( f.group.position.x, this.aimNow.y, f.group.position.z + this.aimNow.h ) : null;
		f.lanceAim = lower ? new Vector3( p.group.position.x, this.plan.y + swo.y, p.group.position.z - ( this.plan.h + swo.h ) ) : null;
		this.foeAimNow = { h: this.plan.h + swo.h, y: this.plan.y + swo.y };

		const braceUp = ( at ) => at !== null && this.time - at < BRACE.hold;
		p.shieldBrace += ( ( braceUp( this.braceAt ) ? 1 : 0 ) - p.shieldBrace ) * Math.min( 1, dt * 14 );
		f.shieldBrace += ( ( braceUp( this.aiBraceAt ) ? 1 : 0 ) - f.shieldBrace ) * Math.min( 1, dt * 14 );

		// the moment of impact slows down
		let wantScale = 1;
		if ( ! this.impactDone && gap < LIST.slowAt && this.phase === 'charge' ) wantScale = 0.3;
		if ( this.impactDone && this.phaseT < 0.9 ) wantScale = 0.25;
		this.timeScale += ( wantScale - this.timeScale ) * Math.min( 1, dt * 8 );

		if ( ! this.impactDone && this.phase === 'charge' && gap <= LIST.reach ) this.impact();

		if ( this.phase === 'after' && this.phaseT > 3.2 && this.fade.target === 0 ) this.fadeTo( 1, 2.5, () => this.endPass() );

		// HUD
		const vmax = 12.5;
		const braceLeft = this.braceAt === null ? 0 : Math.max( 0, 1 - ( this.time - this.braceAt ) / BRACE.hold );
		this.ui.setGauges( this.pr.speed / vmax, braceLeft );
		this.updateReticle( gap );

		// hooves, dust and the crowd
		this.hooves( p, 0.9, - 0.2 );
		this.hooves( f, 0.5, 0.3 );
		for ( const k of [ p, f ] ) if ( k.speed > 3 ) this.particles.kick( _v.copy( k.group.position ), k.speed, gdt );
		const closing = this.phase === 'charge' ? MathUtils.clamp( 1 - gap / 80, 0, 1 ) : 0;
		this.excite = Math.max( this.excite - dt * 0.25, 0.25 + closing * 0.45 );

	}

	updateReticle( gap ) {

		const show = this.phase === 'charge' && gap < LIST.start * 2 - 4 && ! this.impactDone;
		if ( ! show ) return this.ui.setReticle( false );
		const f = this.foe;
		_v.set( f.group.position.x, this.aimNow.y, f.group.position.z + this.aimNow.h );
		this.camera.updateMatrixWorld();
		this.camera.matrixWorldInverse.copy( this.camera.matrixWorld ).invert();
		_v.project( this.camera );
		const w = window.innerWidth, h = window.innerHeight;
		this.ui.setReticle( true, ( _v.x * 0.5 + 0.5 ) * w, ( - _v.y * 0.5 + 0.5 ) * h, zoneAt( this.aimNow.h, this.aimNow.y ).zone );

	}

	impact() {

		this.impactDone = true;
		this.phase = 'after';
		this.phaseT = 0;
		this.impactX = ( this.player.group.position.x + this.foe.group.position.x ) / 2;
		const p = this.player, f = this.foe;
		const pBrace = braceQuality( this.braceAt === null ? null : this.time - this.braceAt );
		const aBrace = braceQuality( this.aiBraceAt === null ? null : this.time - this.aiBraceAt );
		const you = resolveStrike( { h: this.aimNow.h, y: this.aimNow.y, attacker: this.pr, defender: this.or, brace: aBrace, rng: this.rand } );
		const them = resolveStrike( { h: this.foeAimNow.h, y: this.foeAimNow.y, attacker: this.or, defender: this.pr, brace: pBrace, rng: this.rand } );
		this.input.unlock();
		this.ui.setReticle( false );

		const strike = ( atk, def, res, atkRider, colors ) => {

			if ( res.zone === 'miss' ) return;
			atk.update( 0, this.time ); // lance at the contact pose
			const tip = atk.lanceTip( new Vector3() );
			const dir = new Vector3( 0, 0, 1 ).transformDirection( atk.lance.matrixWorld );
			if ( res.broke ) { atk.breakLance(); this.particles.shatter( tip, dir, colors ); }
			def.recoil = res.zone === 'helm' ? 1.3 : 1;
			if ( res.unhorsed ) def.unhorse( new Vector3( def === this.player ? this.pr.speed : - this.or.speed, 0, 0 ) );

		};

		const pc = this.knight.arms.field.map( hexOf ), oc = this.opponent.arms.field.map( hexOf );
		strike( p, f, you, this.pr, pc );
		strike( f, p, them, this.or, oc );

		const anyHit = you.zone !== 'miss' || them.zone !== 'miss';
		if ( anyHit ) {

			this.sound.crash( you.unhorsed || them.unhorsed || you.zone === 'helm' );
			this.renderer.post.fields.flash.value = you.zone !== 'miss' ? 0.55 : 0.3;
			this.shake = them.zone !== 'miss' ? 1 : 0.5;

		}

		if ( you.unhorsed || them.unhorsed ) this.sound.clatter();
		setTimeout( () => {

			if ( you.unhorsed ) { this.sound.cheer( 1.6 ); this.excite = 1; } else if ( them.unhorsed ) { this.sound.groan(); this.excite = 0.7; } else if ( anyHit ) { this.sound.cheer( you.points >= 2 ? 1 : 0.6 ); this.excite = 0.6 + you.points * 0.12; }

		}, 250 );

		const label = ( r ) => r.zone === 'miss' ? 'Missed' : `${ ZONES[ r.zone ].name } +${ r.points }`;
		this.ui.popup( you.unhorsed ? 'Unhorsed!' : label( you ), you.unhorsed ? 'good huge' : you.zone === 'miss' ? '' : 'good', 'you' );
		setTimeout( () => this.ui.popup( them.unhorsed ? 'You fall!' : them.zone === 'miss' ? 'They miss' : `Struck on the ${ ZONES[ them.zone ].name.toLowerCase() } −`, them.unhorsed ? 'bad huge' : 'bad', 'them' ), 350 );
		if ( pBrace === 1 && them.zone !== 'miss' ) setTimeout( () => this.ui.popup( 'Perfect brace!', 'good', 'them' ), 900 );

		this.bout.record( you, them );
		this.ui.setScore( this.bout, true );

	}

	endPass() {

		if ( this.state !== 'joust' ) return;
		if ( ! this.bout.over ) { this.resetPass(); return; }
		const won = this.bout.winner === 'you';
		const outcome = this.tournament.record( { won, score: this.bout.score.slice(), unhorsed: this.bout.unhorsed } );
		if ( outcome === 'champion' ) { this.showChampion(); return; }
		this.state = 'result';
		this.fadeTo( 0, 2 );
		this.resultT = 0;
		// a tableau for the result: the victor with lance raised
		this.placeTitle();
		this.player.group.position.set( - 3.5, 0, LIST.lane + 1.2 );
		this.player.group.rotation.y = won ? 0.6 : 0.2;
		this.foe.group.position.set( 3.5, 0, - LIST.lane - 1.2 );
		this.foe.group.rotation.y = Math.PI + ( won ? 0.2 : 0.6 );
		if ( won ) { this.player.setHelmOff( true ); this.sound.cheer( 1.2 ); this.excite = 0.9; } else { this.sound.lament(); this.excite = 0.4; }
		this.ui.showBoutResult( { won, bout: this.bout, opponent: this.opponent, outcome, defeats: this.tournament.defeats }, {
			onNext: () => { this.sound.click(); this.player.setHelmOff( false ); this.showBracket(); },
			onRetry: () => { this.sound.click(); this.player.setHelmOff( false ); this.startBout(); },
			onQuit: () => {

				this.sound.click();
				this.player.setHelmOff( false );
				const elim = this.tournament.eliminated;
				this.tournament = null;
				if ( elim ) this.ui.showEliminated( { onAgain: () => this.showTitle() } ); else this.showTitle();

			},
		} );

	}

	// ------------------------------------------------------------------ the champion

	showChampion() {

		this.state = 'champion';
		this.champT = 0;
		this.confettiT = 0;
		this.fadeTo( 0, 1.5 );
		const p = this.player;
		this.placeTitle();
		this.foe.group.visible = this.foe.lance.visible = false;
		p.group.position.set( 0, 0, - 5.2 );
		p.group.rotation.y = - Math.PI / 2;
		p.setHelmOff( true );
		p.victory = 1;
		this.excite = 1;
		this.sound.fanfare();
		setTimeout( () => this.sound.cheer( 2 ), 400 );
		setTimeout( () => this.sound.cheer( 1.5 ), 3200 );
		this.ui.showChampion( this.knight, this.tournament, { onAgain: () => {

			this.sound.click();
			p.victory = 0;
			p.setHelmOff( false );
			this.tournament = null;
			this.showCustomize();

		} } );

	}

	// ------------------------------------------------------------------ frame

	fadeTo( target, speed, then = null ) {

		this.fade.target = target;
		this.fade.speed = speed;
		this.fade.then = then;

	}

	snapCamera() {

		this.cameraTarget( 0 );
		this.camera.position.copy( this.cam.pos );
		this.camBase = this.cam.pos.clone();
		this.camLook = this.cam.look.clone();

	}

	// where the camera wants to be for the current state
	cameraTarget( dt ) {

		const c = this.cam, t = this.realTime, p = this.player.group.position;
		c.fov = 55;
		c.rate = 2.5;
		switch ( this.state ) {

			case 'title': {

				const a = t * 0.06;
				c.pos.set( Math.cos( a ) * 17, 4.5 + Math.sin( t * 0.1 ), Math.sin( a ) * 17 + 2 );
				c.look.set( 0, 2.2, 0 );
				c.rate = 1;
				break;

			}

			case 'customize': {

				// centre the knight in the space the panel leaves free (right of it, or above it on phones)
				const W = window.innerWidth, H = window.innerHeight, aspect = W / H;
				const phone = W <= 720;
				const panel = phone ? 0 : Math.min( 0.62, 510 / W );
				const ndcX = 2 * ( panel + ( 1 - panel ) / 2 ) - 1;
				const face = this.customTab === 'knight';
				c.fov = face ? 40 : 45;
				const tanH = Math.tan( c.fov * Math.PI / 360 ) * aspect;
				// step back until the knight (about 3.6 m tall, 2.6 m long) fits the free width
				const free = ( 1 - panel ) * 2 * tanH;
				const dist = face ? Math.max( 2.6, 1.0 / free ) : Math.max( 6.5, 3.6 / free, phone ? 9 : 0 );
				const lookY = face ? 2.62 : phone ? 1.2 : 1.85;
				const shift = ndcX * tanH * dist;
				const fx = face ? p.x + 0.1 : p.x - 0.8;
				c.pos.set( fx, face ? 2.8 : 2.5, p.z + dist );
				c.look.set( fx - shift, lookY, p.z );
				break;

			}

			case 'bracket': {

				const f = this.foe.group.position;
				const k = Math.min( 1, this.bracketT / 12 );
				c.pos.set( f.x - 8.5 + k * 1.2, 2.8, f.z + 6.8 - k * 0.8 );
				c.look.set( f.x - 4.2, 2.0, f.z - 0.5 );
				c.fov = 45;
				c.rate = 1.5;
				break;

			}

			case 'joust': {

				const f = this.foe.group.position;
				const gap = f.x - p.x;
				if ( this.phase === 'after' && this.phaseT > 0.05 ) {

					// watch the aftermath from beside the tilt
					const fallen = this.foe.fallen ? this.foe.rider.position : this.player.fallen ? this.player.rider.position : null;
					const ix = this.impactX;
					c.pos.set( ix - 6, 3.2, 8.5 );
					c.look.set( fallen ? fallen.x : ix + 1.5, fallen ? 1.2 : 2, fallen ? fallen.z : - 0.5 );
					c.rate = 1.2;
					c.fov = 50;

				} else {

					// over the left shoulder, so the opponent is never hidden behind your own knight
					const close = MathUtils.clamp( 1 - gap / 40, 0, 1 );
					c.pos.set( p.x - 4.8 + close * 1.5, 3.9 - close * 0.3, p.z + 0.2 - close * 0.3 );
					c.look.set( p.x + 12 - close * 5, 1.9, p.z - 1.3 );
					if ( gap < 30 ) c.look.lerp( _w.set( f.x, 2.3, f.z ), close * 0.6 );
					c.fov = 55 + Math.min( 1, this.pr.speed / 12 ) * 9;
					c.rate = 8;

				}

				break;

			}

			case 'result': {

				const a = 0.4 + this.resultT * 0.05;
				c.pos.set( Math.cos( a ) * 9, 3, Math.sin( a ) * 9 + 3 );
				c.look.set( 0, 2, 0 );
				c.rate = 1.5;
				break;

			}

			case 'champion': {

				// sweep to and fro in front of the champion, the royal box behind him
				const a = Math.PI * 0.5 + Math.sin( this.champT * 0.16 ) * 0.85;
				const r = 7.2 - Math.min( 1.6, this.champT * 0.25 );
				c.pos.set( p.x + Math.cos( a ) * r, 2.6 + Math.sin( this.champT * 0.21 ) * 0.4, p.z + Math.sin( a ) * r );
				c.look.set( p.x, 2.5, p.z );
				c.rate = 2;
				break;

			}

		}

	}

	updateCamera( dt ) {

		this.cameraTarget( dt );
		const c = this.cam;
		const k = 1 - Math.exp( - c.rate * dt );
		if ( ! this.camBase ) this.camBase = this.camera.position.clone();
		this.camBase.lerp( c.pos, k );
		if ( ! this.camLook ) this.camLook = c.look.clone();
		this.camLook.lerp( c.look, 1 - Math.exp( - c.rate * 1.3 * dt ) );
		this.camera.fov += ( c.fov - this.camera.fov ) * k;
		this.camera.updateProjectionMatrix();
		// gallop jolt and impact shake: an offset on top of the smoothed position
		const gallop = this.state === 'joust' && this.phase === 'charge' ? Math.min( 1, this.player.speed / 12 ) : 0;
		const t = this.realTime;
		this.camera.position.copy( this.camBase );
		this.camera.position.y += Math.sin( this.player.phase * Math.PI * 4 ) * gallop * 0.05 + Math.sin( t * 37 ) * this.shake * 0.06;
		this.camera.position.x += Math.sin( t * 53 ) * this.shake * 0.05;
		this.camera.lookAt( this.camLook.x, this.camLook.y, this.camLook.z );
		this.shake = Math.max( 0, this.shake - dt * 2.2 );

	}

	// hoofbeats: four footfalls per stride
	hooves( k, vol, pan ) {

		if ( k.gait < 0.1 || k.fallen === undefined ) return;
		const prev = k._prevPhase ?? k.phase;
		const beats = k.gait > 0.5 ? [ 0.0, 0.08, 0.42, 0.5 ] : [ 0, 0.5 ];
		for ( const b of beats ) {

			const crossed = prev <= k.phase ? prev < b && k.phase >= b : prev < b || k.phase >= b;
			if ( crossed ) this.sound.hoof( vol * Math.min( 1, k.gait + 0.2 ), pan );

		}

		k._prevPhase = k.phase;

	}

	// dynamic resolution: drop the render scale when frames run long, raise it when there is room
	adaptResolution( dt ) {

		if ( document.visibilityState !== 'visible' ) return;
		const P = this.perf;
		P.t += dt; P.frames ++;
		if ( P.t < 2 ) return;
		const avg = P.t / P.frames;
		P.t = 0; P.frames = 0;
		const s = this.engine.renderScale;
		if ( avg > 1 / 48 && s > 0.6 ) this.engine.setRenderScale( Math.max( 0.6, s * 0.85 ) );
		else if ( avg < 1 / 57 && s < this.maxScale ) this.engine.setRenderScale( Math.min( this.maxScale, s + 0.1 ) );

	}

	update( dt ) {

		this.realTime += dt;
		this.adaptResolution( dt );
		if ( this.paused ) dt = 0;
		const gdt = dt * this.timeScale;
		this.time += gdt;
		G.time.value = this.time;
		G.dt.value = gdt;

		if ( this.state === 'customize' ) {

			// drag to turn the knight on his turntable
			const m = this.input.takeMouse();
			if ( this.input.mouseDown ) this.turn += m.x * 0.008;
			else if ( this.customTab === 'knight' ) this.turn += ( - 1.2 - this.turn ) * Math.min( 1, dt * 3 );
			else this.turn += dt * 0.12;
			this.player.group.rotation.y = this.turn;

		} else if ( this.state === 'bracket' ) this.bracketT += dt;
		else if ( this.state === 'result' ) this.resultT += dt;
		else if ( this.state === 'champion' ) {

			this.champT += dt;
			this.confettiT -= dt;
			if ( this.confettiT <= 0 ) {

				this.confettiT = 0.35;
				const cols = [ ...this.knight.arms.field.map( hexOf ), 0xd6a526, 0xf4f0e8 ];
				this.particles.celebrate( this.player.group.position, cols, this.champT < 3 ? 60 : 18 );

			}

			this.player.lanceAim = _w.set( this.player.group.position.x, 9, this.player.group.position.z - 1 ).clone();
			this.excite = 1;

		}

		if ( this.state === 'joust' && ! this.paused ) this.updateJoust( dt );
		else this.input.takeMouse();

		for ( const k of [ this.player, this.foe ] ) if ( k.group.visible ) k.update( gdt, this.time );
		this.particles.update( gdt, this.time );

		this.arena.excitement = this.excite;
		this.sound.setExcitement( this.excite );
		// music: full in the menus, under the crowd between passes, barely there in the charge
		this.sound.setMusic( this.state === 'joust' ? ( this.phase === 'charge' || this.phase === 'after' ? 0.12 : 0.4 ) : this.state === 'champion' ? 0.35 : 0.8 );

		// fades
		const F = this.fade;
		if ( F.value !== F.target ) {

			F.value = F.target > F.value ? Math.min( F.target, F.value + dt * F.speed ) : Math.max( F.target, F.value - dt * F.speed );
			if ( F.value === F.target && F.then ) { const t = F.then; F.then = null; t(); }

		}

		const post = this.renderer.post.fields;
		post.fade.value = F.value;
		post.flash.value = Math.max( 0, post.flash.value - dt * 1.8 );

		this.updateCamera( dt );
		this.renderFrame();
		this.input.endFrame();

	}

	renderFrame() {

		GPU.beginFrame();
		this.renderer.render( this.scene, this.camera, GPU.context.getCurrentTexture().createView() );
		GPU.submit();

	}

}
