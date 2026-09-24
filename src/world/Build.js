import { Matrix4, Quaternion, Euler, Vector3, Color, Float32BufferAttribute, BufferGeometry, mergeGeometries } from '../engine/index.js';

// Collects primitive geometries with a transform and a colour, and merges them into one
// vertex-coloured geometry: one draw for a whole grandstand or a pavilion.

const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _s = new Vector3(), _p = new Vector3();
const _c = new Color();

export class Build {

	constructor() {

		this.parts = [];

	}

	// o: { p: [x,y,z], r: [x,y,z] (euler), s: [x,y,z] | number, m: Matrix4, uv: [ u0, v0, u1, v1 ] remap }
	add( geometry, color, o = {} ) {

		const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
		if ( o.m ) g.applyMatrix4( o.m );
		else {

			_p.fromArray( o.p || [ 0, 0, 0 ] );
			_e.set( ...( o.r || [ 0, 0, 0 ] ) );
			_q.setFromEuler( _e );
			const s = o.s ?? 1;
			typeof s === 'number' ? _s.set( s, s, s ) : _s.fromArray( s );
			g.applyMatrix4( _m.compose( _p, _q, _s ) );

		}

		const n = g.attributes.position.count;
		const col = new Float32Array( n * 3 );
		_c.set( color );
		for ( let i = 0; i < n; i ++ ) { col[ i * 3 ] = _c.r; col[ i * 3 + 1 ] = _c.g; col[ i * 3 + 2 ] = _c.b; }
		g.setAttribute( 'color', new Float32BufferAttribute( col, 3 ) );
		if ( o.uv && g.attributes.uv ) {

			const uv = g.attributes.uv.array, [ u0, v0, u1, v1 ] = o.uv;
			for ( let i = 0; i < uv.length; i += 2 ) { uv[ i ] = u0 + uv[ i ] * ( u1 - u0 ); uv[ i + 1 ] = v0 + uv[ i + 1 ] * ( v1 - v0 ); }

		}

		for ( const k of Object.keys( g.attributes ) ) if ( ! [ 'position', 'normal', 'uv', 'color' ].includes( k ) ) g.deleteAttribute( k );
		this.parts.push( g );
		return g;

	}

	get empty() {

		return this.parts.length === 0;

	}

	geometry() {

		const g = this.parts.length ? mergeGeometries( this.parts ) : new BufferGeometry();
		g.computeBoundingBox();
		g.computeBoundingSphere();
		return g;

	}

}

// colour helpers (sRGB hex -> the engine's linear Color)
export const hex = ( h ) => new Color( h );
