import { Texture, UniformBlock, ShaderModule, SceneLighting, surfaceModule, generateMipmaps, G } from '../engine/webgpu.js';
import { Vector3, Color } from '../engine/index.js';

// Image-based lighting from a real sky: a Poly Haven HDRI (quarry_01, CC0: clear sky over a flat
// sandy plain with a low tree line, much like a tiltyard). It is the visible sky, what polished
// plate reflects, and the ambient light (as 9 spherical-harmonic coefficients).
//
// The HDRI's own sun is clipped out: the engine's sun (shadowed, direct light) replaces it. The
// panorama is turned so its bright side lines up with the engine's sun.
//
// Equirect convention (rows top first): phi = u * 2PI - PI, theta = v * PI,
// dir = ( sin(theta) cos(phi), cos(theta), sin(theta) sin(phi) ).

export const ENV_URL = './assets/env/quarry_01_1k.hdr';

const SH_FIELDS = {};
for ( let i = 0; i < 9; i ++ ) SH_FIELDS[ 'sh' + i ] = [ 'vec4f', [ 0, 0, 0, 0 ] ];
// until (or unless) the HDRI loads: a plain blue sky over a brown ground
SH_FIELDS.sh0[ 1 ] = [ 1.2, 1.35, 1.6, 0 ];
SH_FIELDS.sh1[ 1 ] = [ 0.45, 0.6, 0.85, 0 ];

export const EnvUniforms = new UniformBlock( 'EnvParams', {
	// rotation of the panorama about y (cos, sin), intensity of the sky, max mip level
	rot: [ 'vec4f', [ 1, 0, 1, 8 ] ],
	...SH_FIELDS,
} );

// 1 x 1 placeholder until the HDRI is in (and for runs without it)
let envTexture = new Texture( { label: 'env', width: 2, height: 1, format: 'rgba16float', data: new Uint16Array( 8 ).fill( 0x3800 ) } ); // 0.5

export const envModule = new ShaderModule( {
	name: 'env',
	deps: [ surfaceModule ],
	uniforms: EnvUniforms,
	bindings: { envMap: { texture: () => envTexture } },
	code: /* wgsl */`
		fn envUV( d: vec3f ) -> vec2f {
			let c = envParams.rot.x; let s = envParams.rot.y;
			let r = vec3f( c * d.x - s * d.z, d.y, s * d.x + c * d.z );
			let phi = atan2( r.z, r.x );
			return vec2f( phi * 0.15915494 + 0.5, acos( clamp( r.y, -1.0, 1.0 ) ) * 0.31830989 );
		}
		fn envRadiance( d: vec3f, lod: f32 ) -> vec3f {
			return textureSampleLevel( envMap, smpLinearRepeat, envUV( d ), lod ).rgb * envParams.rot.z;
		}
		// cosine-convolved irradiance / PI from the SH coefficients
		fn envIrradiance( n: vec3f ) -> vec3f {
			let c = envParams.rot.x; let s = envParams.rot.y;
			let d = vec3f( c * n.x - s * n.z, n.y, s * n.x + c * n.z );
			var e = envParams.sh0.rgb * 0.886227;
			e += envParams.sh1.rgb * ( 1.023328 * d.y );
			e += envParams.sh2.rgb * ( 1.023328 * d.z );
			e += envParams.sh3.rgb * ( 1.023328 * d.x );
			e += envParams.sh4.rgb * ( 0.858086 * d.x * d.y );
			e += envParams.sh5.rgb * ( 0.858086 * d.y * d.z );
			e += envParams.sh6.rgb * ( 0.247708 * ( 3.0 * d.y * d.y - 1.0 ) );
			e += envParams.sh7.rgb * ( 0.858086 * d.x * d.z );
			e += envParams.sh8.rgb * ( 0.429043 * ( d.x * d.x - d.z * d.z ) );
			return max( e, vec3f( 0.0 ) ) * 0.31830989 * envParams.rot.z;
		}
	`,
} );

// Specular: the panorama, blurrier (a higher mip) the rougher the surface. The lower half is the
// quarry's sand, close to the lists' own; it is darkened a little toward the nadir where the
// knight's own horse and shadow would be.
const ENV_SPECULAR = /* wgsl */`
fn hookEnvSpecular( R: vec3f, roughness: f32 ) -> vec3f {
	let lod = clamp( sqrt( roughness ) * envParams.rot.w, 0.0, envParams.rot.w );
	var c = envRadiance( R, lod );
	c *= mix( 1.0, 0.55, smoothstep( 0.0, -0.6, R.y ) );
	// the sun, which the panorama no longer holds, as a highlight on smooth metal
	let sd = max( dot( R, frame.sunDir ), 0.0 );
	c += frame.sunColor * pow( sd, mix( 900.0, 6.0, sqrt( roughness ) ) ) * mix( 6.0, 0.05, sqrt( roughness ) );
	return c * frame.envIntensity;
}
`;

const ENV_DIFFUSE = /* wgsl */`
fn hookEnvDiffuse( N: vec3f ) -> vec3f {
	return envIrradiance( N ) * frame.envIntensity;
}
`;

export function installEnvironmentLighting() {

	SceneLighting.set( 'envSpecular', new ShaderModule( { name: 'hook-envSpecular-hdri', deps: [ surfaceModule, envModule ], code: ENV_SPECULAR } ) );
	SceneLighting.set( 'envDiffuse', new ShaderModule( { name: 'hook-envDiffuse-hdri', deps: [ surfaceModule, envModule ], code: ENV_DIFFUSE } ) );

}

// ------------------------------------------------------------------------------ loading

export async function loadEnvironment( url = ENV_URL ) {

	let buffer;
	if ( globalThis.__assetFile ) buffer = await globalThis.__assetFile( url );
	else {

		const res = await fetch( url );
		if ( ! res.ok ) throw new Error( 'HDRI: ' + url + ' ' + res.status );
		buffer = await res.arrayBuffer();

	}

	return setEnvironment( parseHDR( buffer ) );

}

// Radiance .hdr (RGBE, new-style RLE) -> Float32Array rgb, rows top first
export function parseHDR( buffer ) {

	const d = new Uint8Array( buffer );
	let pos = 0;
	const line = () => {

		let s = '';
		while ( pos < d.length && d[ pos ] !== 10 ) s += String.fromCharCode( d[ pos ++ ] );
		pos ++;
		return s;

	};

	if ( ! line().startsWith( '#?' ) ) throw new Error( 'HDRI: not a Radiance file' );
	while ( line() !== '' ) { /* header */ }
	const m = /-Y (\d+) \+X (\d+)/.exec( line() );
	if ( ! m ) throw new Error( 'HDRI: unsupported orientation' );
	const height = Number( m[ 1 ] ), width = Number( m[ 2 ] );
	const rgbe = new Uint8Array( width * 4 );
	const out = new Float32Array( width * height * 3 );
	for ( let y = 0; y < height; y ++ ) {

		if ( d[ pos ] !== 2 || d[ pos + 1 ] !== 2 ) throw new Error( 'HDRI: only RLE scanlines are supported' );
		pos += 4;
		for ( let c = 0; c < 4; c ++ ) {

			for ( let x = 0; x < width; ) {

				let n = d[ pos ++ ];
				if ( n > 128 ) {

					n -= 128;
					const v = d[ pos ++ ];
					for ( let k = 0; k < n; k ++ ) rgbe[ ( x ++ ) * 4 + c ] = v;

				} else for ( let k = 0; k < n; k ++ ) rgbe[ ( x ++ ) * 4 + c ] = d[ pos ++ ];

			}

		}

		for ( let x = 0; x < width; x ++ ) {

			const e = rgbe[ x * 4 + 3 ];
			const f = e ? Math.pow( 2, e - 136 ) : 0;
			const o = ( y * width + x ) * 3;
			out[ o ] = rgbe[ x * 4 ] * f; out[ o + 1 ] = rgbe[ x * 4 + 1 ] * f; out[ o + 2 ] = rgbe[ x * 4 + 2 ] * f;

		}

	}

	return { width, height, data: out };

}

const dirOf = ( x, y, W, H, v ) => {

	const phi = ( x + 0.5 ) / W * Math.PI * 2 - Math.PI, th = ( y + 0.5 ) / H * Math.PI;
	return v.set( Math.sin( th ) * Math.cos( phi ), Math.cos( th ), Math.sin( th ) * Math.sin( phi ) );

};

// Upload a panorama, find and clip its sun, fit the SH, and line it up with the engine's sun.
// Returns { sunDir (panorama space), horizon (Color), skyIrradiance (Color) }.
export function setEnvironment( { width: W, height: H, data } ) {

	const lum = ( i ) => data[ i ] * 0.2126 + data[ i + 1 ] * 0.7152 + data[ i + 2 ] * 0.0722;
	// the sun: the brightest texel
	let best = 0, bi = 0;
	for ( let i = 0; i < W * H; i ++ ) { const l = lum( i * 3 ); if ( l > best ) { best = l; bi = i; } }
	const sun = dirOf( bi % W, Math.floor( bi / W ), W, H, new Vector3() );

	// clip it: anything far brighter than the sky around it is the solar disc and its bloom
	let skySum = 0, skyN = 0;
	for ( let y = 0; y < H / 2; y ++ ) for ( let x = 0; x < W; x += 4 ) { skySum += lum( ( y * W + x ) * 3 ); skyN ++; }
	const clip = ( skySum / skyN ) * 3;
	for ( let i = 0; i < W * H; i ++ ) {

		const l = lum( i * 3 );
		if ( l > clip ) { const k = clip / l; data[ i * 3 ] *= k; data[ i * 3 + 1 ] *= k; data[ i * 3 + 2 ] *= k; }

	}

	// SH9 projection (solid-angle weighted)
	const sh = Array.from( { length: 9 }, () => [ 0, 0, 0 ] );
	const v = new Vector3();
	const horizon = [ 0, 0, 0 ];
	let hn = 0, wsum = 0;
	for ( let y = 0; y < H; y ++ ) {

		const th = ( y + 0.5 ) / H * Math.PI;
		const dw = Math.sin( th ) * ( Math.PI / H ) * ( 2 * Math.PI / W );
		for ( let x = 0; x < W; x ++ ) {

			dirOf( x, y, W, H, v );
			const o = ( y * W + x ) * 3;
			const b = [ 0.282095, 0.488603 * v.y, 0.488603 * v.z, 0.488603 * v.x, 1.092548 * v.x * v.y, 1.092548 * v.y * v.z, 0.315392 * ( 3 * v.y * v.y - 1 ), 1.092548 * v.x * v.z, 0.546274 * ( v.x * v.x - v.z * v.z ) ];
			for ( let k = 0; k < 9; k ++ ) for ( let c = 0; c < 3; c ++ ) sh[ k ][ c ] += data[ o + c ] * b[ k ] * dw;
			wsum += dw;
			if ( Math.abs( v.y ) < 0.08 ) { horizon[ 0 ] += data[ o ]; horizon[ 1 ] += data[ o + 1 ]; horizon[ 2 ] += data[ o + 2 ]; hn ++; }

		}

	}

	// normalise the brightness: the sky's irradiance on an upward face / PI becomes ~0.42, which
	// balances the engine's sun (G.sunColor)
	const upE = [ 0, 1, 2 ].map( ( c ) => ( sh[ 0 ][ c ] * 0.886227 + sh[ 1 ][ c ] * 1.023328 + sh[ 6 ][ c ] * 0.247708 * 2 ) / Math.PI );
	const upL = upE[ 0 ] * 0.2126 + upE[ 1 ] * 0.7152 + upE[ 2 ] * 0.0722;
	const scale = 0.42 / Math.max( 1e-4, upL );
	for ( let k = 0; k < 9; k ++ ) EnvUniforms.set( 'sh' + k, [ sh[ k ][ 0 ] * scale, sh[ k ][ 1 ] * scale, sh[ k ][ 2 ] * scale, 0 ] );

	// half-float texture with a mip chain (roughness -> blur)
	const px = new Uint16Array( W * H * 4 );
	for ( let i = 0; i < W * H; i ++ ) {

		px[ i * 4 ] = toHalf( data[ i * 3 ] * scale );
		px[ i * 4 + 1 ] = toHalf( data[ i * 3 + 1 ] * scale );
		px[ i * 4 + 2 ] = toHalf( data[ i * 3 + 2 ] * scale );
		px[ i * 4 + 3 ] = 0x3c00;

	}

	envTexture = new Texture( { label: 'env', width: W, height: H, format: 'rgba16float', mips: true, usage: [ 'sample', 'copyDst' ] } );
	envTexture.upload( px );
	generateMipmaps( envTexture );

	// turn the panorama so its sun sits at the engine's sun azimuth
	const want = Math.atan2( G.sunDir.value.z, G.sunDir.value.x ), have = Math.atan2( sun.z, sun.x );
	// envUV rotates the lookup direction by +a: r = rotY( d ); we need rotY( sunEngine ) = sunPanorama
	const a = have - want;
	EnvUniforms.set( 'rot', [ Math.cos( a ), Math.sin( a ), 1, envTexture.mipLevelCount - 3 ] );

	const hz = new Color( horizon[ 0 ] / hn * scale, horizon[ 1 ] / hn * scale, horizon[ 2 ] / hn * scale );
	return { sunDir: sun, horizon: hz, scale };

}

// float -> IEEE half (round to nearest)
const _f = new Float32Array( 1 ), _u = new Uint32Array( _f.buffer );
export function toHalf( v ) {

	_f[ 0 ] = v;
	const x = _u[ 0 ];
	const s = ( x >> 16 ) & 0x8000;
	let e = ( ( x >> 23 ) & 0xff ) - 127 + 15;
	let m = x & 0x7fffff;
	if ( e <= 0 ) {

		if ( e < - 10 ) return s;
		m = ( m | 0x800000 ) >> ( 1 - e );
		return s | ( ( m + 0x1000 ) >> 13 );

	}

	if ( e >= 31 ) return s | 0x7bff; // clamp to the largest half
	const h = s | ( e << 10 ) | ( ( m + 0x1000 ) >> 13 );
	return h;

}
