// Keyboard and mouse. Held keys, one-shot presses (consumed by `pressed`), and mouse movement
// accumulated between frames (pointer lock during a charge, plain movement otherwise).
export class Input {

	constructor( element ) {

		this.element = element;
		this.down = new Set();
		this.hits = new Set();
		this.dx = 0;
		this.dy = 0;
		this.mouseDown = false;
		window.addEventListener( 'keydown', ( e ) => {

			if ( e.target instanceof HTMLInputElement ) return;
			if ( [ 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight' ].includes( e.code ) ) e.preventDefault();
			if ( ! e.repeat ) this.hits.add( e.code );
			this.down.add( e.code );

		} );
		window.addEventListener( 'keyup', ( e ) => this.down.delete( e.code ) );
		window.addEventListener( 'blur', () => { this.down.clear(); this.mouseDown = false; } );
		window.addEventListener( 'mousemove', ( e ) => { this.dx += e.movementX || 0; this.dy += e.movementY || 0; } );
		element.addEventListener( 'mousedown', ( e ) => { if ( e.button === 0 ) { this.mouseDown = true; this.hits.add( 'Mouse0' ); } if ( e.button === 2 ) this.hits.add( 'Mouse2' ); } );
		window.addEventListener( 'mouseup', ( e ) => { if ( e.button === 0 ) this.mouseDown = false; } );
		element.addEventListener( 'contextmenu', ( e ) => e.preventDefault() );

	}

	held( ...codes ) {

		return codes.some( ( c ) => this.down.has( c ) );

	}

	pressed( ...codes ) {

		let any = false;
		for ( const c of codes ) if ( this.hits.delete( c ) ) any = true;
		return any;

	}

	// mouse movement since the last call
	takeMouse() {

		const d = { x: this.dx, y: this.dy };
		this.dx = 0; this.dy = 0;
		return d;

	}

	endFrame() {

		this.hits.clear();

	}

	lock() {

		if ( document.pointerLockElement !== this.element && this.element.requestPointerLock ) {

			try { const p = this.element.requestPointerLock(); if ( p && p.catch ) p.catch( () => {} ); } catch ( e ) { /* not allowed here */ }

		}

	}

	unlock() {

		if ( document.pointerLockElement ) document.exitPointerLock();

	}

	get locked() {

		return document.pointerLockElement === this.element;

	}

}
