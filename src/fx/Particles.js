import { InstancedMesh, BoxGeometry, PlaneGeometry, Matrix4, Vector3, Quaternion, Euler, Color } from '../engine/index.js';
import { Material } from '../engine/webgpu.js';

// CPU particles drawn as instanced boxes: lance splinters, hoof dust, and the confetti and rose
// petals of the victory. A pool per kind; dead particles are scaled to zero.

const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _s = new Vector3(), _c = new Color();

class Pool {

	constructor( geometry, material, count ) {

		this.mesh = new InstancedMesh( geometry, material, count );
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.count = count;
		this.p = [];
		for ( let i = 0; i < count; i ++ ) {

			this.p.push( { life: 0, pos: new Vector3(), vel: new Vector3(), rot: new Vector3(), spin: new Vector3(), size: new Vector3( 1, 1, 1 ), drag: 0, flutter: 0, ground: 0 } );
			this.mesh.setMatrixAt( i, _m.makeScale( 0, 0, 0 ) );
			this.mesh.setColorAt( i, _c.setRGB( 1, 1, 1 ) );

		}

		this.next = 0;

	}

	spawn( o ) {

		const i = this.next;
		this.next = ( this.next + 1 ) % this.count;
		const q = this.p[ i ];
		q.life = o.life;
		q.pos.copy( o.pos );
		q.vel.copy( o.vel );
		q.rot.set( Math.random() * 6, Math.random() * 6, Math.random() * 6 );
		q.spin.set( ( Math.random() - 0.5 ) * o.spin, ( Math.random() - 0.5 ) * o.spin, ( Math.random() - 0.5 ) * o.spin );
		q.size.copy( o.size );
		q.drag = o.drag || 0;
		q.flutter = o.flutter || 0;
		q.gravity = o.gravity ?? 9.81;
		q.fade = o.fade || 0;
		this.mesh.setColorAt( i, _c.set( o.color ) );
		this.mesh.instanceColor.needsUpdate = true;

	}

	update( dt, time ) {

		for ( let i = 0; i < this.count; i ++ ) {

			const q = this.p[ i ];
			if ( q.life <= 0 ) continue;
			q.life -= dt;
			q.vel.y -= q.gravity * dt;
			q.vel.multiplyScalar( Math.max( 0, 1 - q.drag * dt ) );
			if ( q.flutter ) { q.vel.x += Math.sin( time * 3 + i ) * q.flutter * dt; q.vel.z += Math.cos( time * 2.3 + i * 1.7 ) * q.flutter * dt; }
			q.pos.addScaledVector( q.vel, dt );
			if ( q.pos.y < 0.02 ) { q.pos.y = 0.02; q.vel.set( 0, 0, 0 ); q.spin.multiplyScalar( 0.5 ); }
			q.rot.addScaledVector( q.spin, dt );
			const k = q.life <= 0 ? 0 : q.fade ? Math.min( 1, q.life / q.fade ) : 1;
			_q.setFromEuler( _e.set( q.rot.x, q.rot.y, q.rot.z ) );
			this.mesh.setMatrixAt( i, _m.compose( q.pos, _q, _s.copy( q.size ).multiplyScalar( k ) ) );

		}

		this.mesh.instanceMatrix.needsUpdate = true;

	}

}

export class Particles {

	constructor( scene ) {

		const mat = new Material( { name: 'fx', vertexColors: true, roughness: 0.8, side: 'double' } );
		this.splinters = new Pool( new BoxGeometry( 1, 1, 1 ), mat, 160 );
		this.dust = new Pool( new BoxGeometry( 1, 1, 1 ), new Material( { name: 'dust', color: 0x8a7050, roughness: 1, transparent: true, opacity: 0.45, depthWrite: false } ), 220 );
		this.confetti = new Pool( new PlaneGeometry( 1, 1 ), mat, 700 );
		for ( const p of [ this.splinters, this.dust, this.confetti ] ) scene.add( p.mesh );
		this.dustTimer = 0;

	}

	// a lance shatters at `at`, travelling along `dir`
	shatter( at, dir, colors ) {

		for ( let i = 0; i < 46; i ++ ) {

			const v = dir.clone().multiplyScalar( - 2 - Math.random() * 4 ).add( new Vector3( ( Math.random() - 0.5 ) * 7, Math.random() * 6, ( Math.random() - 0.5 ) * 7 ) );
			const long = 0.08 + Math.random() * 0.35;
			this.splinters.spawn( {
				pos: at, vel: v, life: 3 + Math.random() * 2, spin: 30, drag: 0.4, fade: 0.5,
				size: new Vector3( 0.025 + Math.random() * 0.02, long, 0.025 ),
				color: i % 3 === 0 ? 0xc9a070 : colors[ i % colors.length ],
			} );

		}

	}

	// dust kicked up behind a galloping horse
	kick( at, speed, dt ) {

		this.dustTimer += dt * speed * 1.4;
		while ( this.dustTimer > 1 ) {

			this.dustTimer -= 1;
			this.dust.spawn( {
				pos: at.clone().add( new Vector3( ( Math.random() - 0.5 ) * 0.8, 0.05, ( Math.random() - 0.5 ) * 0.8 ) ),
				vel: new Vector3( ( Math.random() - 0.5 ) * 1.2, 0.6 + Math.random() * 0.9, ( Math.random() - 0.5 ) * 1.2 ),
				life: 0.9 + Math.random() * 0.6, spin: 2, drag: 2, gravity: - 0.2, fade: 0.8,
				size: new Vector3( 0.3, 0.3, 0.3 ).multiplyScalar( 0.6 + Math.random() ),
				color: 0xffffff,
			} );

		}

	}

	// confetti and rose petals over the champion
	celebrate( center, colors, n = 36 ) {

		for ( let i = 0; i < n; i ++ ) {

			const petal = Math.random() < 0.35;
			this.confetti.spawn( {
				pos: center.clone().add( new Vector3( ( Math.random() - 0.5 ) * 14, 7 + Math.random() * 6, ( Math.random() - 0.5 ) * 14 ) ),
				vel: new Vector3( ( Math.random() - 0.5 ) * 2, - 0.5, ( Math.random() - 0.5 ) * 2 ),
				life: 7 + Math.random() * 3, spin: 8, drag: 3.2, gravity: 2.2, flutter: 5, fade: 1.5,
				size: petal ? new Vector3( 0.09, 0.06, 1 ) : new Vector3( 0.07, 0.11, 1 ),
				color: petal ? ( Math.random() < 0.7 ? 0xc0162a : 0xf4f0f0 ) : colors[ Math.floor( Math.random() * colors.length ) ],
			} );

		}

	}

	update( dt, time ) {

		this.splinters.update( dt, time );
		this.dust.update( dt, time );
		this.confetti.update( dt, time );

	}

}
