// All sound is synthesised with WebAudio: no files to load. A crowd bed that swells with
// excitement, hoofbeats that follow the gait, the crack of a lance, trumpets and a fanfare.

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

	// the crowd: band-passed noise with a slow murmur; excitement raises level and brightness
	startCrowd() {

		const c = this.ctx;
		const src = this.noiseSource( true );
		const bp = c.createBiquadFilter();
		bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
		const g = c.createGain();
		g.gain.value = 0.05;
		const lfo = c.createOscillator(), lg = c.createGain();
		lfo.frequency.value = 0.3; lg.gain.value = 0.015;
		lfo.connect( lg ).connect( g.gain );
		src.connect( bp ).connect( g ).connect( this.master );
		src.start(); lfo.start();
		this.crowd = { g, bp };

	}

	setExcitement( e ) {

		if ( ! this.ctx ) return;
		const t = this.ctx.currentTime;
		this.crowd.g.gain.setTargetAtTime( 0.04 + e * 0.22, t, 0.4 );
		this.crowd.bp.frequency.setTargetAtTime( 600 + e * 900, t, 0.4 );

	}

	// a cheer: a swell of the crowd plus a few "huzzah" formant bursts
	cheer( strength = 1 ) {

		if ( ! this.ctx ) return;
		const c = this.ctx, t = c.currentTime;
		const src = this.noiseSource();
		const bp = c.createBiquadFilter();
		bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.8;
		const g = c.createGain();
		g.gain.setValueAtTime( 0, t );
		g.gain.linearRampToValueAtTime( 0.35 * strength, t + 0.25 );
		g.gain.exponentialRampToValueAtTime( 0.001, t + 2.8 );
		src.connect( bp ).connect( g ).connect( this.master );
		src.start( t ); src.stop( t + 3 );
		for ( let i = 0; i < 5 * strength; i ++ ) {

			const o = c.createOscillator(), og = c.createGain(), f = c.createBiquadFilter();
			o.type = 'sawtooth';
			const t0 = t + 0.1 + Math.random() * 0.8;
			o.frequency.setValueAtTime( 180 + Math.random() * 160, t0 );
			o.frequency.linearRampToValueAtTime( 260 + Math.random() * 200, t0 + 0.3 );
			f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3;
			og.gain.setValueAtTime( 0, t0 );
			og.gain.linearRampToValueAtTime( 0.03, t0 + 0.05 );
			og.gain.exponentialRampToValueAtTime( 0.001, t0 + 0.6 );
			o.connect( f ).connect( og ).connect( this.master );
			o.start( t0 ); o.stop( t0 + 0.7 );

		}

	}

	groan() {

		if ( ! this.ctx ) return;
		const c = this.ctx, t = c.currentTime;
		const src = this.noiseSource();
		const lp = c.createBiquadFilter();
		lp.type = 'lowpass'; lp.frequency.setValueAtTime( 900, t ); lp.frequency.linearRampToValueAtTime( 300, t + 1.5 );
		const g = c.createGain();
		g.gain.setValueAtTime( 0, t ); g.gain.linearRampToValueAtTime( 0.25, t + 0.2 ); g.gain.exponentialRampToValueAtTime( 0.001, t + 1.8 );
		src.connect( lp ).connect( g ).connect( this.master );
		src.start( t ); src.stop( t + 2 );

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
