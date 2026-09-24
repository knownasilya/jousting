// All sound is synthesised with WebAudio: no files to load. A crowd of chattering voices that
// swells with excitement, a little medieval music, hoofbeats that follow the gait, the crack of a
// lance, trumpets and a fanfare.

export class Sound {

	constructor() {

		this.ctx = null;
		this.muted = false;
		this.excite = 0.2;

	}

	// browsers only start audio after a user gesture
	resume() {

		if ( ! this.ctx ) {

			const AC = window.AudioContext || window.webkitAudioContext;
			if ( ! AC ) return;
			this.ctx = new AC();
			this.master = this.ctx.createGain();
			this.master.gain.value = this.muted ? 0 : 0.8;
			this.master.connect( this.ctx.destination );
			this.noise = this.makeNoise();
			this.startCrowd();
			this.startMusic();

		}

		if ( this.ctx.state === 'suspended' ) this.ctx.resume();

	}

	toggleMute() {

		this.muted = ! this.muted;
		if ( this.master ) this.master.gain.setTargetAtTime( this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05 );
		return this.muted;

	}

	makeNoise() {

		const len = this.ctx.sampleRate * 2;
		const b = this.ctx.createBuffer( 1, len, this.ctx.sampleRate );
		const d = b.getChannelData( 0 );
		for ( let i = 0; i < len; i ++ ) d[ i ] = Math.random() * 2 - 1;
		return b;

	}

	noiseSource( loop = false ) {

		const s = this.ctx.createBufferSource();
		s.buffer = this.noise;
		s.loop = loop;
		return s;

	}

	// ---------------------------------------------------------------- the crowd
	// Not a hiss but people: a babble of synthesised voices. Each voice is a buzzing glottal tone
	// through two vowel formants, speaking in syllables with pauses; pitch, pace, loudness and the
	// number talking rise with excitement. A quiet low rumble of distant crowd and a short open-air
	// reverb glue them together.
	startCrowd() {

		const c = this.ctx;
		this.crowdOut = c.createGain();
		this.crowdOut.gain.value = 0.6;
		const lp = c.createBiquadFilter();
		lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.5;
		this.crowdOut.connect( lp ).connect( this.master );
		// reverb: a second of decaying noise as the impulse, mixed in quietly
		const verb = c.createConvolver();
		verb.buffer = this.makeImpulse( 1.1 );
		const wet = c.createGain();
		wet.gain.value = 0.35;
		this.crowdOut.connect( verb ).connect( wet ).connect( lp );
		// the far crowd: noise below 400 Hz, a soft rumble rather than a hiss
		const src = this.noiseSource( true );
		const rl = c.createBiquadFilter();
		rl.type = 'lowpass'; rl.frequency.value = 380; rl.Q.value = 0.3;
		const rg = c.createGain();
		rg.gain.value = 0.05;
		src.connect( rl ).connect( rg ).connect( lp );
		src.start();
		this.crowd = { rumble: rg };
		this.voices = [];
		for ( let i = 0; i < 20; i ++ ) this.voices.push( this.makeVoice( i ) );
		this.cheerUntil = 0;
		this.groanUntil = 0;
		this.scheduleCrowd();
		this.crowdTimer = setInterval( () => this.scheduleCrowd(), 80 );

	}

	makeImpulse( seconds ) {

		const c = this.ctx, len = Math.floor( c.sampleRate * seconds );
		const b = c.createBuffer( 2, len, c.sampleRate );
		for ( let ch = 0; ch < 2; ch ++ ) {

			const d = b.getChannelData( ch );
			for ( let i = 0; i < len; i ++ ) d[ i ] = ( Math.random() * 2 - 1 ) * Math.pow( 1 - i / len, 3 ) * ( i < 200 ? 0 : 1 );

		}

		return b;

	}

	makeVoice( i ) {

		const c = this.ctx;
		const lady = i % 3 === 0;
		const base = lady ? 180 + Math.random() * 60 : 95 + Math.random() * 50;
		const o = c.createOscillator();
		o.type = 'sawtooth';
		o.frequency.value = base;
		const f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g2 = c.createGain();
		f1.type = f2.type = 'bandpass';
		f1.Q.value = 5; f2.Q.value = 9;
		g2.gain.value = 0.45;
		const env = c.createGain();
		env.gain.value = 0;
		const pan = c.createStereoPanner ? c.createStereoPanner() : null;
		o.connect( f1 ).connect( env );
		o.connect( f2 ).connect( g2 ).connect( env );
		if ( pan ) { pan.pan.value = Math.random() * 1.6 - 0.8; env.connect( pan ).connect( this.crowdOut ); } else env.connect( this.crowdOut );
		o.start();
		return { o, f1, f2, env, base, lady, next: c.currentTime + Math.random() * 0.8, vol: 0.5 + Math.random() * 0.7 };

	}

	// schedule the next few syllables of every voice (called every 80 ms, looks ahead 0.3 s)
	scheduleCrowd( now = this.ctx.currentTime ) {

		// vowel formants (F1, F2): ah, eh, ee, oh, oo, uh
		const VOWELS = [ [ 780, 1250 ], [ 540, 1800 ], [ 320, 2250 ], [ 520, 900 ], [ 340, 820 ], [ 620, 1180 ] ];
		const e = this.excite;
		for ( const v of this.voices ) {

			while ( v.next < now + 0.3 ) {

				const t = Math.max( v.next, now );
				const cheering = t < this.cheerUntil, groaning = t < this.groanUntil;
				const talk = cheering ? 0.95 : groaning ? 0.8 : 0.3 + e * 0.55;
				if ( Math.random() > talk ) { v.next = t + 0.25 + Math.random() * 0.9; continue; }
				// a word of 1 to 3 syllables
				const syllables = cheering ? 1 : 1 + Math.floor( Math.random() * 3 );
				let at = t;
				for ( let s = 0; s < syllables; s ++ ) {

					const vw = cheering ? VOWELS[ Math.random() < 0.7 ? 0 : 1 ] : groaning ? VOWELS[ 3 + Math.floor( Math.random() * 2 ) ] : VOWELS[ Math.floor( Math.random() * VOWELS.length ) ];
					const k = v.lady ? 1.15 : 1;
					const dur = cheering ? 0.5 + Math.random() * 0.7 : groaning ? 0.5 + Math.random() * 0.4 : ( 0.09 + Math.random() * 0.16 ) / ( 1 + e * 0.4 );
					const lift = cheering ? 1.55 + Math.random() * 0.3 : 1 + e * 0.35;
					const f0 = v.base * lift * ( 0.9 + Math.random() * 0.2 );
					// only strictly ordered, linear automation: overlapping exponential targets can
					// run away in some WebAudio implementations
					const rel = cheering ? 0.25 : groaning ? 0.15 : 0.04;
					v.o.frequency.setValueAtTime( f0, at );
					v.o.frequency.linearRampToValueAtTime( f0 * ( groaning ? 0.75 : cheering ? 1.05 : 0.93 ), at + dur + rel );
					v.f1.frequency.setValueAtTime( vw[ 0 ] * k, at );
					v.f2.frequency.setValueAtTime( vw[ 1 ] * k, at );
					const level = v.vol * ( cheering ? 0.6 : groaning ? 0.35 : 0.16 + e * 0.3 );
					v.env.gain.setValueAtTime( 0, at );
					v.env.gain.linearRampToValueAtTime( level, at + 0.02 );
					v.env.gain.setValueAtTime( level, at + dur );
					v.env.gain.linearRampToValueAtTime( 0, at + dur + rel );
					at += dur + rel + 0.01 + Math.random() * 0.05;

				}

				v.next = at + 0.08 + Math.random() * ( 0.5 - e * 0.35 );

			}

		}

	}

	setExcitement( e ) {

		if ( ! this.ctx ) return;
		this.excite = e;
		this.crowd.rumble.gain.setTargetAtTime( 0.035 + e * 0.07, this.ctx.currentTime, 0.5 );

	}

	// a cheer: the whole crowd shouts, with a swell of distant voices under it
	cheer( strength = 1 ) {

		if ( ! this.ctx ) return;
		const c = this.ctx, t = c.currentTime;
		this.cheerUntil = t + 1.4 + strength;
		const src = this.noiseSource();
		const lp = c.createBiquadFilter();
		lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4;
		const g = c.createGain();
		g.gain.setValueAtTime( 0, t );
		g.gain.linearRampToValueAtTime( 0.1 * strength, t + 0.3 );
		g.gain.exponentialRampToValueAtTime( 0.001, t + 2.8 );
		src.connect( lp ).connect( g ).connect( this.crowdOut );
		src.start( t ); src.stop( t + 3 );

	}

	// a groan: falling "ohh"s
	groan() {

		if ( ! this.ctx ) return;
		const t = this.ctx.currentTime;
		this.groanUntil = t + 1.6;

	}

	// ---------------------------------------------------------------- music
	// A little estampie for the lists: a bagpipe-like drone on D and A, a reedy pipe playing the
	// tune in D dorian, and a tabor. It plays softly in the menus and drops back under the crowd
	// while you ride (setMusic).
	startMusic() {

		const c = this.ctx;
		this.musicOut = c.createGain();
		this.musicOut.gain.value = 0;
		this.musicOut.connect( this.master );
		const verb = c.createConvolver();
		verb.buffer = this.makeImpulse( 1.6 );
		const wet = c.createGain();
		wet.gain.value = 0.3;
		this.musicBus = c.createGain();
		this.musicBus.connect( this.musicOut );
		this.musicBus.connect( verb ).connect( wet ).connect( this.musicOut );
		// the drone: D3 and A3, two slightly detuned reeds each, breathing a little
		const dl = c.createBiquadFilter();
		dl.type = 'lowpass'; dl.frequency.value = 900; dl.Q.value = 0.7;
		const dg = c.createGain();
		dg.gain.value = 0.035;
		dl.connect( dg ).connect( this.musicBus );
		for ( const f of [ 146.83, 220 ] ) for ( const d of [ - 4, 4 ] ) {

			const o = c.createOscillator();
			o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
			o.connect( dl ); o.start();

		}

		const lfo = c.createOscillator(), lg = c.createGain();
		lfo.frequency.value = 0.18; lg.gain.value = 0.008;
		lfo.connect( lg ).connect( dg.gain ); lfo.start();
		this.musicAt = c.currentTime + 0.2;
		this.musicStep = 0;
		this.musicBeat = 0;
		this.musicLevel = 0;
		this.scheduleMusic();
		this.musicTimer = setInterval( () => this.scheduleMusic(), 100 );

	}

	// the tune: [ semitones above D4 (null = rest), beats ]
	static TUNE = [
		// A: rising and turning
		[ 7, 1 ], [ 7, 0.5 ], [ 9, 0.5 ], [ 10, 1 ], [ 9, 0.5 ], [ 7, 0.5 ], [ 5, 1 ], [ 7, 1 ], [ 3, 1 ], [ 2, 1 ],
		[ 0, 1 ], [ 2, 0.5 ], [ 3, 0.5 ], [ 5, 1 ], [ 3, 0.5 ], [ 2, 0.5 ], [ 0, 2 ], [ null, 1 ],
		[ 7, 1 ], [ 7, 0.5 ], [ 9, 0.5 ], [ 10, 1 ], [ 12, 1 ], [ 10, 0.5 ], [ 9, 0.5 ], [ 7, 1 ], [ 5, 1 ], [ 3, 1 ],
		[ 2, 0.5 ], [ 3, 0.5 ], [ 5, 1 ], [ 3, 1 ], [ 2, 1 ], [ 0, 2 ], [ null, 1 ],
		// B: up to the high D and home
		[ 12, 1 ], [ 12, 0.5 ], [ 10, 0.5 ], [ 12, 1 ], [ 14, 1 ], [ 12, 0.5 ], [ 10, 0.5 ], [ 9, 1 ], [ 7, 2 ],
		[ 9, 0.5 ], [ 10, 0.5 ], [ 12, 1 ], [ 10, 0.5 ], [ 9, 0.5 ], [ 7, 1 ], [ 5, 1 ], [ 7, 2 ], [ null, 1 ],
		[ 5, 1 ], [ 7, 0.5 ], [ 9, 0.5 ], [ 10, 1 ], [ 9, 1 ], [ 7, 0.5 ], [ 5, 0.5 ], [ 3, 1 ], [ 2, 1 ],
		[ 3, 0.5 ], [ 2, 0.5 ], [ 0, 1 ], [ 2, 1 ], [ 0, 3 ], [ null, 1 ],
	];

	scheduleMusic( now = this.ctx.currentTime ) {

		const beat = 60 / 104;
		const tune = Sound.TUNE;
		while ( this.musicAt < now + 0.4 ) {

			const [ n, b ] = tune[ this.musicStep ];
			const t = Math.max( this.musicAt, now ), dur = b * beat;
			if ( n !== null ) this.pipe( 293.66 * Math.pow( 2, n / 12 ), t, dur );
			// the tabor: a stroke on every beat, strong on the first of each pair, a flam now and then
			for ( let k = 0; k < b; k += 0.5 ) {

				const tb = t + k * beat, whole = Math.abs( ( this.musicBeat + k ) % 1 ) < 0.01;
				if ( whole ) this.tabor( tb, ( Math.round( this.musicBeat + k ) % 2 === 0 ) ? 1 : 0.55 );
				else if ( Math.random() < 0.25 ) this.tabor( tb, 0.35 );

			}

			this.musicBeat += b;
			this.musicAt += dur;
			this.musicStep = ( this.musicStep + 1 ) % tune.length;

		}

	}

	// a reedy pipe: a square-ish tone through a soft filter, with a breathy attack and vibrato
	pipe( f, t, dur ) {

		const c = this.ctx;
		const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
		o.type = 'square'; o.frequency.value = f;
		o2.type = 'triangle'; o2.frequency.value = f * 2;
		const vib = c.createOscillator(), vg = c.createGain();
		vib.frequency.value = 5.2; vg.gain.value = f * 0.006;
		vib.connect( vg ); vg.connect( o.frequency ); vg.connect( o2.frequency );
		lp.type = 'lowpass'; lp.frequency.value = f * 3.2; lp.Q.value = 0.8;
		const og2 = c.createGain(); og2.gain.value = 0.3;
		o.connect( lp ); o2.connect( og2 ).connect( lp );
		lp.connect( g ).connect( this.musicBus );
		const end = t + dur * 0.92;
		g.gain.setValueAtTime( 0, t );
		g.gain.linearRampToValueAtTime( 0.05, t + 0.03 );
		g.gain.setTargetAtTime( 0.038, t + 0.05, 0.08 );
		g.gain.setTargetAtTime( 0, end - 0.03, 0.02 );
		for ( const x of [ o, o2, vib ] ) { x.start( t ); x.stop( end + 0.15 ); }

	}

	tabor( t, v ) {

		const c = this.ctx;
		const o = c.createOscillator(), g = c.createGain();
		o.frequency.setValueAtTime( 170, t ); o.frequency.exponentialRampToValueAtTime( 70, t + 0.09 );
		g.gain.setValueAtTime( 0.12 * v, t ); g.gain.exponentialRampToValueAtTime( 0.001, t + 0.16 );
		o.connect( g ).connect( this.musicBus );
		o.start( t ); o.stop( t + 0.17 );
		// the snare across the head
		const n = this.noiseSource(), bp = c.createBiquadFilter(), ng = c.createGain();
		bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.9;
		ng.gain.setValueAtTime( 0.045 * v, t ); ng.gain.exponentialRampToValueAtTime( 0.001, t + 0.1 );
		n.connect( bp ).connect( ng ).connect( this.musicBus );
		n.start( t, Math.random() ); n.stop( t + 0.11 );

	}

	// 0 silent .. 1 full (menus); the joust uses a lower level
	setMusic( level ) {

		if ( ! this.ctx || level === this.musicLevel ) return;
		this.musicLevel = level;
		this.musicOut.gain.setTargetAtTime( level, this.ctx.currentTime, 0.8 );

	}

	// one hoof on packed earth: a low thump and a little grit
	hoof( volume = 1, pan = 0 ) {

		if ( ! this.ctx ) return;
		const c = this.ctx, t = c.currentTime;
		const o = c.createOscillator(), g = c.createGain();
		o.frequency.setValueAtTime( 120, t ); o.frequency.exponentialRampToValueAtTime( 45, t + 0.08 );
		g.gain.setValueAtTime( 0.3 * volume, t ); g.gain.exponentialRampToValueAtTime( 0.001, t + 0.12 );
		const p = c.createStereoPanner ? c.createStereoPanner() : null;
		const out = p || this.master;
		if ( p ) { p.pan.value = pan; p.connect( this.master ); }
		o.connect( g ).connect( out );
		o.start( t ); o.stop( t + 0.13 );
		const n = this.noiseSource(), nf = c.createBiquadFilter(), ng = c.createGain();
		nf.type = 'lowpass'; nf.frequency.value = 1400;
		ng.gain.setValueAtTime( 0.12 * volume, t ); ng.gain.exponentialRampToValueAtTime( 0.001, t + 0.06 );
		n.connect( nf ).connect( ng ).connect( out );
		n.start( t, Math.random() ); n.stop( t + 0.07 );

	}

	// the lance shatters: a sharp crack, a splintering rattle and a thud
	crash( big = false ) {

		if ( ! this.ctx ) return;
		const c = this.ctx, t = c.currentTime;
		const n = this.noiseSource(), hp = c.createBiquadFilter(), g = c.createGain();
		hp.type = 'highpass'; hp.frequency.value = 1200;
		g.gain.setValueAtTime( 0.9, t ); g.gain.exponentialRampToValueAtTime( 0.001, t + 0.35 );
		n.connect( hp ).connect( g ).connect( this.master );
		n.start( t ); n.stop( t + 0.4 );
		for ( let i = 0; i < 9; i ++ ) {

			const t0 = t + 0.03 + Math.random() * 0.35;
			const s = this.noiseSource(), bp = c.createBiquadFilter(), sg = c.createGain();
			bp.type = 'bandpass'; bp.frequency.value = 2000 + Math.random() * 3000; bp.Q.value = 6;
			sg.gain.setValueAtTime( 0.25, t0 ); sg.gain.exponentialRampToValueAtTime( 0.001, t0 + 0.05 );
			s.connect( bp ).connect( sg ).connect( this.master );
			s.start( t0, Math.random() ); s.stop( t0 + 0.06 );

		}

		const o = c.createOscillator(), og = c.createGain();
		o.frequency.setValueAtTime( big ? 90 : 140, t ); o.frequency.exponentialRampToValueAtTime( 35, t + 0.3 );
		og.gain.setValueAtTime( big ? 0.8 : 0.5, t ); og.gain.exponentialRampToValueAtTime( 0.001, t + 0.35 );
		o.connect( og ).connect( this.master );
		o.start( t ); o.stop( t + 0.4 );

	}

	// a knight hits the ground in plate
	clatter() {

		if ( ! this.ctx ) return;
		const c = this.ctx, t = c.currentTime + 0.35;
		for ( let i = 0; i < 6; i ++ ) {

			const t0 = t + i * 0.07 + Math.random() * 0.05;
			const o = c.createOscillator(), g = c.createGain();
			o.type = 'square';
			o.frequency.value = 400 + Math.random() * 900;
			g.gain.setValueAtTime( 0.08, t0 ); g.gain.exponentialRampToValueAtTime( 0.001, t0 + 0.15 );
			o.connect( g ).connect( this.master );
			o.start( t0 ); o.stop( t0 + 0.16 );

		}

		this.hoof( 2.5 );

	}

	// a brass voice: two detuned saws through a filter that opens on the attack
	brass( freq, t0, dur, vol = 0.12 ) {

		const c = this.ctx;
		const f = c.createBiquadFilter(), g = c.createGain();
		f.type = 'lowpass'; f.Q.value = 2;
		f.frequency.setValueAtTime( freq * 1.5, t0 );
		f.frequency.linearRampToValueAtTime( freq * 6, t0 + 0.06 );
		f.frequency.linearRampToValueAtTime( freq * 3.5, t0 + dur );
		g.gain.setValueAtTime( 0, t0 );
		g.gain.linearRampToValueAtTime( vol, t0 + 0.04 );
		g.gain.setValueAtTime( vol * 0.85, t0 + dur - 0.05 );
		g.gain.linearRampToValueAtTime( 0, t0 + dur );
		f.connect( g ).connect( this.master );
		for ( const d of [ - 6, 6 ] ) {

			const o = c.createOscillator();
			o.type = 'sawtooth';
			o.frequency.value = freq;
			o.detune.value = d;
			o.connect( f );
			o.start( t0 ); o.stop( t0 + dur + 0.02 );

		}

	}

	// herald's call before each pass
	trumpet() {

		if ( ! this.ctx ) return;
		const t = this.ctx.currentTime + 0.05;
		const G4 = 392, C5 = 523.25, E5 = 659.25, G5 = 783.99;
		[ [ G4, 0.14 ], [ C5, 0.14 ], [ E5, 0.14 ], [ G5, 0.5 ] ].reduce( ( at, [ f, d ] ) => { this.brass( f, at, d ); return at + d + 0.02; }, t );

	}

	// the victory fanfare
	fanfare() {

		if ( ! this.ctx ) return;
		const t = this.ctx.currentTime + 0.1;
		const n = { C4: 261.63, G4: 392, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, C6: 1046.5 };
		const tune = [ [ 'G4', 0.16 ], [ 'C5', 0.16 ], [ 'E5', 0.16 ], [ 'G5', 0.4 ], [ 'E5', 0.16 ], [ 'G5', 0.9 ], [ null, 0.15 ],
			[ 'F5', 0.16 ], [ 'E5', 0.16 ], [ 'D5', 0.16 ], [ 'E5', 0.16 ], [ 'F5', 0.16 ], [ 'G5', 0.3 ], [ 'C6', 1.3 ] ];
		let at = t;
		for ( const [ k, d ] of tune ) {

			if ( k ) { this.brass( n[ k ], at, d, 0.1 ); this.brass( n[ k ] / 2, at, d, 0.05 ); }
			at += d + 0.02;

		}

		// a held chord under the last note, and drums
		this.brass( n.C4, at - 1.3, 1.3, 0.06 ); this.brass( n.G4, at - 1.3, 1.3, 0.05 );
		for ( let i = 0; i < 8; i ++ ) setTimeout( () => this.hoof( 1.6 ), ( 0.1 + i * 0.36 ) * 1000 );

	}

	// a short sting for a lost bout
	lament() {

		if ( ! this.ctx ) return;
		const t = this.ctx.currentTime + 0.05;
		[ [ 392, 0.4 ], [ 349.23, 0.4 ], [ 311.13, 0.9 ] ].reduce( ( at, [ f, d ] ) => { this.brass( f / 2, at, d, 0.08 ); return at + d + 0.03; }, t );

	}

	click() {

		if ( ! this.ctx ) return;
		const c = this.ctx, t = c.currentTime;
		const o = c.createOscillator(), g = c.createGain();
		o.type = 'triangle'; o.frequency.value = 880;
		g.gain.setValueAtTime( 0.06, t ); g.gain.exponentialRampToValueAtTime( 0.001, t + 0.07 );
		o.connect( g ).connect( this.master );
		o.start( t ); o.stop( t + 0.08 );

	}

}
