import { Material, Texture } from '../engine/webgpu.js';
import { paintArms } from '../game/Heraldry.js';

// Shared materials. The engine compiles one pipeline per material, so the world uses a small fixed
// set and changes uniforms and texture contents instead of making new ones.

// ---- heraldry atlas: one 256 px square per house, side by side
export const ATLAS_SLOTS = 8;
export const ATLAS_SIZE = 256;
export const SLOT = { player: 0 }; // opponents use slots 1..5 (their seed), 6 and 7 are spare

export const heraldryAtlas = new Texture( {
	label: 'heraldryAtlas', width: ATLAS_SIZE * ATLAS_SLOTS, height: ATLAS_SIZE, format: 'rgba8unorm-srgb',
	usage: [ 'sample', 'copyDst' ], data: new Uint8Array( ATLAS_SIZE * ATLAS_SLOTS * ATLAS_SIZE * 4 ).fill( 200 ),
} );

// paint a coat of arms into its atlas slot
export function setAtlasArms( slot, arms ) {

	const px = paintArms( arms, ATLAS_SIZE, { ss: 2 } );
	heraldryAtlas.upload( px, { x: slot * ATLAS_SIZE, y: 0, width: ATLAS_SIZE, height: ATLAS_SIZE } );

}

// uv range of a slot (Build.add's `uv` option). v spans a little past 0..1 on tall banners so the
// field colours stretch rather than the charge.
export const slotUV = ( slot, v0 = 0, v1 = 1 ) => [ ( slot + 0.02 ) / ATLAS_SLOTS, v0, ( slot + 0.98 ) / ATLAS_SLOTS, v1 ];

let _mats = null;

export function worldMaterials() {

	if ( _mats ) return _mats;
	_mats = {

		// everything static and plain: stands, fences, tents, the castle
		vc: new Material( { name: 'vc', vertexColors: true, roughness: 0.82 } ),

		// double-sided cloth (tent canvas, awnings)
		cloth: new Material( { name: 'cloth', vertexColors: true, roughness: 0.9, side: 'double' } ),

		// banners and pennants: heraldry from the atlas, waving in the wind (the flag hangs from uv.y = 1)
		banner: new Material( {
			name: 'banner', vertexColors: true, roughness: 0.85, side: 'double',
			textures: { heraldry: heraldryAtlas },
			vertex: /* wgsl */`
				let w = clamp( 1.25 - v.uv.y, 0.0, 1.5 );
				let ph = v.model[ 3 ].x * 0.37 + v.model[ 3 ].z * 0.21;
				v.position.z += w * ( sin( frame.time * 3.1 + v.position.y * 2.3 + ph ) * 0.07 + sin( frame.time * 5.3 + v.position.x * 4.0 + ph ) * 0.025 );
			`,
			surface: /* wgsl */`
				let t = textureSample( heraldry, smpLinearClamp, vec2f( in.uv.x, 1.0 - in.uv.y ) );
				s.albedo = t.rgb * in.color.rgb;
			`,
		} ),

		// the ground: grass, and the packed-earth lists around the tilt
		ground: new Material( {
			name: 'ground', roughness: 0.95,
			surface: /* wgsl */`
				let p = in.P.xz;
				let n1 = mx_noise_float2( p * 0.08 ) * 0.5 + 0.5;
				let n2 = mx_noise_float2( p * 0.6 ) * 0.5 + 0.5;
				let n3 = mx_noise_float2( p * 3.1 ) * 0.5 + 0.5;
				var grass = mix( vec3f( 0.07, 0.13, 0.03 ), vec3f( 0.16, 0.22, 0.05 ), n1 );
				grass = mix( grass, grass * vec3f( 1.25, 1.1, 0.7 ), n2 * 0.6 );
				grass *= 0.85 + 0.3 * n3;
				// the lists: a sandy track, churned along both sides of the tilt
				let lx = abs( p.x ); let lz = abs( p.y );
				let edge = mx_noise_float2( p * 0.35 ) * 1.2;
				let track = 1.0 - smoothstep( 7.5 + edge, 9.0 + edge, lz ) * 1.0;
				let trackMask = track * ( 1.0 - smoothstep( 52.0, 56.0 + edge * 2.0, lx ) );
				let ruts = smoothstep( 0.35, 0.0, abs( lz - 2.0 ) ) * 0.25;
				var dirt = mix( vec3f( 0.3, 0.22, 0.13 ), vec3f( 0.42, 0.33, 0.2 ), n2 );
				dirt *= 0.85 + 0.25 * n3 - ruts;
				s.albedo = mix( grass, dirt, trackMask );
				s.roughness = mix( 0.95, 0.9, trackMask );
			`,
		} ),

		// sky dome: a gradient, a sun disc and a few painted cloud bands
		sky: new Material( {
			name: 'sky', lit: false, side: 'back', receiveShadows: false,
			surface: /* wgsl */`
				let d = normalize( in.P - frame.cameraPos );
				let h = max( d.y, 0.0 );
				var c = mix( vec3f( 0.62, 0.7, 0.82 ), vec3f( 0.1, 0.26, 0.66 ), pow( h, 0.5 ) );
				c = mix( c, vec3f( 0.62, 0.62, 0.58 ), smoothstep( 0.0, -0.1, d.y ) );
				let sd = max( dot( d, frame.sunDir ), 0.0 );
				c += vec3f( 1.0, 0.85, 0.6 ) * ( pow( sd, 900.0 ) * 30.0 + pow( sd, 12.0 ) * 0.25 );
				let cp = d.xz / max( d.y + 0.08, 0.04 );
				let cl = smoothstep( 0.05, 0.6, mx_noise_float2( cp * 0.35 + vec2f( frame.time * 0.01, 0.0 ) ) * 0.6 + mx_noise_float2( cp * 1.1 ) * 0.35 + 0.1 );
				c = mix( c, vec3f( 1.0, 0.98, 0.95 ) * ( 0.95 + 0.3 * sd ), cl * smoothstep( 0.0, 0.25, d.y ) * 0.85 );
				s.albedo = c * 3.0;
				s.emissive = vec3f( 0.0 );
			`,
		} ),

		// the crowd: instanced people who jump when excited
		crowd: new Material( {
			name: 'crowd', vertexColors: true, roughness: 0.9,
			uniforms: { excite: [ 'f32', 0.2 ] },
			vertex: /* wgsl */`
				let id = f32( v.instance );
				let ph = fract( sin( id * 12.9898 ) * 43758.5453 );
				let rate = 7.0 + ph * 5.0;
				let jump = max( 0.0, sin( frame.time * rate + ph * 6.28 ) );
				let idle = sin( frame.time * ( 1.0 + ph ) + ph * 20.0 ) * 0.02;
				v.worldOffset.y = jump * jump * mat.excite * 0.45 + idle;
				// arms (off-centre, above the shoulders) hang down when calm and rise when cheering
				if ( abs( v.position.x ) > 0.17 && v.position.y > 0.6 ) {
					let k = mix( - 0.85, 1.0, clamp( mat.excite * 1.4 + jump * 0.2 - 0.2, 0.0, 1.0 ) );
					v.position.y = 0.6 + ( v.position.y - 0.6 ) * k;
					v.position.x = sign( v.position.x ) * ( 0.2 + ( abs( v.position.x ) - 0.2 ) * k ) + sin( frame.time * rate * 0.5 + ph * 9.0 ) * 0.08 * mat.excite;
				}
			`,
		} ),

	};
	return _mats;

}
