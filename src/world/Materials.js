import { Material, Texture, ShaderModule } from '../engine/webgpu.js';
import { paintArms } from '../game/Heraldry.js';
import { envModule } from './Environment.js';
import { crowdMaterial } from './Crowd.js';

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

// Surfaces of the world, worked out from the world position (no UVs needed): grained and
// weathered wood, painted boards, dressed stone, canvas, gilding, bark and leaves, and the ground.
export const surfacesModule = new ShaderModule( {
	name: 'worldSurfaces',
	code: /* wgsl */`
		fn surfaceKind( a: f32 ) -> i32 { return i32( floor( a * 16.0 ) ); }

		// fade for detail finer than a pixel (freq: cycles per metre)
		// (fw: the pixel's footprint, length( fwidth( P ) ), taken once in uniform control flow)
		fn detailFade( fw: f32, freq: f32 ) -> f32 {
			return 1.0 - smoothstep( 0.35, 1.0, fw * freq );
		}

		fn fbm3( p: vec3f ) -> f32 {
			return mx_noise_float3( p ) * 0.55 + mx_noise_float3( p * 2.1 + 3.7 ) * 0.28 + mx_noise_float3( p * 4.3 + 9.1 ) * 0.14;
		}

		fn fbm2( p: vec2f ) -> f32 {
			return mx_noise_float2( p ) * 0.55 + mx_noise_float2( p * 2.07 + 3.7 ) * 0.28 + mx_noise_float2( p * 4.3 + 9.1 ) * 0.14 + mx_noise_float2( p * 8.9 + 1.3 ) * 0.07;
		}

		// grain of sawn timber along one world axis (1 x, 2 y, 3 z): long streaks, growth rings on the
		// cut faces, and silvery weathering where rain and sun reach
		fn woodGrain( in: FragInput, s: ptr<function, Surface>, axis: i32, strength: f32, fw: f32 ) {
			var along = in.P.x; var cross = in.P.yz;
			if ( axis == 2 ) { along = in.P.y; cross = in.P.xz; }
			if ( axis == 3 ) { along = in.P.z; cross = in.P.xy; }
			let fade = detailFade( fw, 40.0 );
			let warp = mx_noise_float3( vec3f( cross * 2.0, along * 0.3 ) ) * 1.6;
			let streak = mx_noise_float3( vec3f( cross * 38.0 + warp, along * 0.45 ) );
			let rings = sin( ( cross.x * 0.7 + cross.y * 1.3 ) * 42.0 + warp * 7.0 ) * 0.5 + 0.5;
			let plank = mx_noise_float3( vec3f( floor( cross * 3.0 ), floor( along * 0.33 ) ) * 1.7 ) * 0.5 + 0.5;
			var g = ( 0.8 + 0.2 * plank ) * ( 1.0 - strength * fade * ( 0.18 * ( streak * 0.5 + 0.5 ) + 0.12 * rings ) );
			s.albedo *= g;
			// weathering: grey and paler on the tops, darker with damp near the ground
			let w = smoothstep( -0.2, 0.6, fbm3( in.P * vec3f( 0.8, 0.4, 0.8 ) ) ) * ( 0.25 + 0.5 * max( in.N.y, 0.0 ) );
			let grey = vec3f( dot( s.albedo, vec3f( 0.33 ) ) ) * 1.15;
			s.albedo = mix( s.albedo, grey, w * strength * 0.6 );
			s.albedo *= mix( 0.6, 1.0, smoothstep( 0.0, 0.5, in.P.y ) );
			s.roughness = clamp( 0.72 + 0.2 * ( streak * 0.5 + 0.5 ), 0.0, 1.0 );
			// the streaks catch the light: tilt the normal across the grain
			let e = 0.004;
			var dir = vec3f( 0.0, 1.0, 0.0 );
			if ( axis == 2 ) { dir = vec3f( 1.0, 0.0, 0.0 ); }
			let t = normalize( dir - in.N * dot( dir, in.N ) + vec3f( 1e-4 ) );
			let d = mx_noise_float3( vec3f( cross * 38.0 + warp, along * 0.45 ) + vec3f( e * 38.0 ) ) - streak;
			s.normal = normalize( s.normal - t * d * 0.35 * strength * fade );
		}

		// dressed stone: courses of blocks with mortar joints, each block its own tone, rain streaks
		fn masonry( in: FragInput, s: ptr<function, Surface>, fw: f32 ) {
			let wall = abs( in.N.y ) < 0.7;
			var h = select( in.P.x, in.P.z, abs( in.N.x ) > abs( in.N.z ) );
			var v = in.P.y;
			if ( ! wall ) { h = in.P.x; v = in.P.z; }
			let ch = 0.52; let bl = 1.05;
			let row = floor( v / ch );
			let x = h / bl + row * 0.5 + hash11( row ) * 0.3;
			let bx = floor( x );
			let fx = fract( x ); let fy = fract( v / ch );
			let jx = min( fx, 1.0 - fx ) * bl; let jy = min( fy, 1.0 - fy ) * ch;
			let fade = detailFade( fw, 6.0 );
			let joint = ( 1.0 - smoothstep( 0.015, 0.035, min( jx, jy ) ) ) * fade;
			let tone = hash21( vec2f( bx, row ) );
			var c = s.albedo * ( 0.82 + 0.3 * tone );
			c *= 0.88 + 0.24 * ( fbm3( in.P * 3.0 ) * 0.5 + 0.5 );
			// lichen and rain streaks
			let lichen = smoothstep( 0.25, 0.55, fbm3( in.P * vec3f( 0.6, 0.25, 0.6 ) + 11.0 ) );
			c = mix( c, c * vec3f( 0.72, 0.78, 0.6 ), lichen * 0.6 );
			let rain = smoothstep( 0.1, 0.5, mx_noise_float2( vec2f( h * 1.7, v * 0.08 ) ) ) * 0.25;
			c *= 1.0 - rain;
			s.albedo = mix( c, c * 0.45, joint );
			s.roughness = 0.9;
			s.ao = mix( 1.0, 0.55, joint );
			// the block faces are slightly domed: bend the normal toward the joints
			let tb = select( vec3f( 1.0, 0.0, 0.0 ), vec3f( 0.0, 0.0, 1.0 ), abs( in.N.x ) > abs( in.N.z ) );
			if ( wall ) {
				let gx = ( smoothstep( 0.0, 0.12, jx ) - 1.0 ) * sign( fx - 0.5 );
				let gy = ( smoothstep( 0.0, 0.1, jy ) - 1.0 ) * sign( fy - 0.5 );
				s.normal = normalize( s.normal + ( tb * gx + vec3f( 0.0, gy, 0.0 ) ) * 0.35 * fade );
			}
		}

		fn canvasWeave( in: FragInput, s: ptr<function, Surface>, fw: f32 ) {
			let fade = detailFade( fw, 260.0 );
			let q = in.P * 260.0;
			let w = sin( q.x + q.z ) * sin( q.y );
			s.albedo *= 1.0 + w * 0.06 * fade;
			// weather stains and mud splashed up the bottom
			s.albedo *= 0.9 + 0.12 * ( fbm3( in.P * 1.3 ) * 0.5 + 0.5 );
			let mud = ( 1.0 - smoothstep( 0.0, 0.7 + fbm3( in.P * 4.0 ) * 0.4, in.P.y ) );
			s.albedo = mix( s.albedo, vec3f( 0.16, 0.12, 0.08 ), mud * 0.55 );
			s.roughness = 0.88;
			s.translucency = s.albedo * 0.35;
			s.sheenColor = s.albedo * 0.3;
			s.sheenRoughness = 0.7;
		}

		fn canvasSurface( in: FragInput, s: ptr<function, Surface> ) {
			s.alpha = 1.0;
			canvasWeave( in, s, length( fwidth( in.P ) ) );
		}

		fn worldSurface( in: FragInput, s: ptr<function, Surface> ) {
			s.alpha = 1.0;
			let fw = length( fwidth( in.P ) );
			let k = surfaceKind( in.color.a );
			if ( k == 0 ) {
				// painted boards: a faint grain under the paint, scuffs and grime low down
				// painted boards: plank seams, a faint grain under the paint, paint worn through to the
				// wood at the edges and low down, grime near the ground
				let paint = s.albedo;
				woodGrain( in, s, select( 1, 3, abs( in.N.x ) > abs( in.N.z ) ), 0.35, fw );
				let wall = abs( in.N.y ) < 0.5;
				let seam = ( 1.0 - smoothstep( 0.0, 0.012, abs( fract( in.P.y * 4.0 + 0.5 ) - 0.5 ) / 4.0 ) ) * detailFade( fw, 8.0 ) * select( 0.0, 1.0, wall );
				let wear = smoothstep( 0.42, 0.62, fbm3( in.P * vec3f( 3.0, 9.0, 3.0 ) ) + ( 0.6 - clamp( in.P.y, 0.0, 0.6 ) ) * 0.4 );
				s.albedo = mix( s.albedo, vec3f( 0.2, 0.14, 0.09 ) * ( 0.8 + 0.4 * paint.r ), wear * 0.85 );
				s.albedo *= 1.0 - seam * 0.6;
				s.ao = 1.0 - seam * 0.5;
				s.roughness = mix( 0.55, 0.85, wear );
			} else if ( k >= 1 && k <= 3 ) {
				woodGrain( in, s, k, 1.0, fw );
			} else if ( k == 4 ) {
				masonry( in, s, fw );
			} else if ( k == 5 ) {
				canvasWeave( in, s, fw );
			} else if ( k == 6 ) {
				s.metalness = 1.0; s.roughness = 0.32 + 0.2 * ( fbm3( in.P * 9.0 ) * 0.5 + 0.5 );
			} else if ( k == 7 ) {
				s.metalness = 0.85; s.roughness = 0.55 + 0.3 * ( fbm3( in.P * 7.0 ) * 0.5 + 0.5 );
				s.albedo *= mix( vec3f( 1.0 ), vec3f( 1.3, 0.8, 0.5 ), smoothstep( 0.2, 0.6, fbm3( in.P * 3.0 ) ) );
			} else if ( k == 8 ) {
				s.albedo *= 0.8 + 0.3 * ( fbm3( in.P * 2.0 ) * 0.5 + 0.5 );
				s.roughness = 0.95;
			} else if ( k == 9 ) {
				// foliage: clumps of leaves (the normal breaks up into many small facing directions),
				// light through the leaves, sun-bleached tops
				let fade = detailFade( fw, 7.0 );
				let n = vec3f( mx_noise_float3( in.P * 7.0 ), mx_noise_float3( in.P * 7.0 + 17.0 ), mx_noise_float3( in.P * 7.0 + 31.0 ) );
				s.normal = normalize( s.normal + n * 1.1 * ( 0.3 + 0.7 * fade ) );
				let v = fbm3( in.P * 1.1 ) * 0.5 + 0.5;
				let leaf = mx_noise_float3( in.P * 14.0 ) * 0.5 + 0.5;
				s.albedo *= ( 0.55 + 0.55 * v ) * ( 0.7 + 0.45 * leaf * fade );
				s.albedo = mix( s.albedo, s.albedo * vec3f( 1.15, 1.1, 0.8 ), smoothstep( 0.3, 0.9, in.N.y ) * 0.3 );
				s.ao = 0.55 + 0.45 * smoothstep( -0.6, 0.6, dot( in.N, normalize( vec3f( 0.0, 1.0, 0.0 ) ) ) );
				s.roughness = 0.75;
				s.translucency = s.albedo * 0.3;
			} else if ( k == 10 ) {
				// bark: deep vertical furrows
				let f = mx_noise_float3( vec3f( in.P.x * 22.0, in.P.y * 2.5, in.P.z * 22.0 ) );
				s.albedo *= 0.7 + 0.45 * smoothstep( -0.4, 0.5, f );
				s.roughness = 0.95;
				s.ao = 0.7 + 0.3 * smoothstep( -0.5, 0.3, f );
			}
		}

		// ---------------------------------------------------------------- the ground
		// height of the churned sand in the lists (for the bump), p in metres
		fn churn( p: vec2f, lane: f32 ) -> f32 {
			let c = fbm2( p * 3.5 ) * 0.5 + 0.5;
			// hoofprints: small crescents in cells along the lanes
			let cell = floor( p * vec2f( 1.6, 3.0 ) );
			let f = fract( p * vec2f( 1.6, 3.0 ) ) - 0.5 - ( hash22( cell ) - 0.5 ) * 0.5;
			let r = length( f * vec2f( 1.0, 1.4 ) );
			let print = ( 1.0 - smoothstep( 0.07, 0.13, r ) ) * step( hash21( cell + 3.1 ), 0.55 );
			return c * 0.6 - print * lane * 0.6;
		}

		fn groundSurface( in: FragInput, s: ptr<function, Surface> ) {
			let p = in.P.xz;
			let dist = length( in.P - frame.cameraPos );
			let fw = length( fwidth( in.P ) );
			let fadeFine = detailFade( fw, 12.0 );
			// meadow: patches of lush and dry grass, clover, a few bare spots
			let n1 = fbm2( p * 0.035 ) * 0.5 + 0.5;
			let n2 = fbm2( p * 0.22 + 5.0 ) * 0.5 + 0.5;
			let n3 = mx_noise_float2( p * 9.0 ) * 0.5 + 0.5;
			let blades = mx_noise_float2( p * vec2f( 38.0, 41.0 ) ) * 0.5 + 0.5;
			let lush = vec3f( 0.04, 0.068, 0.02 );
			let dry = vec3f( 0.12, 0.105, 0.05 );
			var grass = mix( lush, lush * vec3f( 1.35, 1.25, 0.9 ), n2 );
			grass = mix( grass, dry, smoothstep( 0.45, 0.8, n1 ) * 0.7 );
			grass *= 0.82 + 0.3 * mix( 0.5, n3, fadeFine ) + 0.18 * ( blades - 0.5 ) * fadeFine;
			// far meadow: bluer and paler with distance (the eye does not resolve blades)
			grass = mix( grass, grass * vec3f( 0.95, 1.0, 1.1 ), smoothstep( 60.0, 300.0, dist ) );
			// trampled grass round the lists and the stands
			let lx = abs( p.x ); let lz = abs( p.y );
			let trample = ( 1.0 - smoothstep( 12.0, 22.0, lz ) ) * ( 1.0 - smoothstep( 58.0, 70.0, lx ) );
			grass = mix( grass, vec3f( 0.11, 0.1, 0.05 ), trample * smoothstep( 0.35, 0.75, n2 ) * 0.6 );
			// the lists: sand over packed earth
			let edge = fbm2( p * 0.3 ) * 1.4;
			let track = 1.0 - smoothstep( 7.0 + edge, 9.2 + edge, lz );
			let trackMask = track * ( 1.0 - smoothstep( 52.0, 57.0 + edge * 2.0, lx ) );
			let lane = smoothstep( 1.1, 0.2, abs( lz - 1.25 ) ) * ( 1.0 - smoothstep( 44.0, 50.0, lx ) );
			let h = mix( 0.3, churn( p, lane * fadeFine ), fadeFine );
			var sand = mix( vec3f( 0.23, 0.16, 0.095 ), vec3f( 0.34, 0.25, 0.15 ), n2 );
			sand *= 0.8 + 0.35 * h;
			// the lanes are dug up darker and damp, a pale strip where nobody rides beside the tilt
			sand = mix( sand, sand * vec3f( 0.72, 0.68, 0.64 ), lane * 0.75 );
			sand = mix( sand, sand * 1.12, smoothstep( 0.45, 0.1, lz ) );
			// straw scattered over the sand
			let straw = smoothstep( 0.72, 0.9, mx_noise_float2( p * vec2f( 3.0, 22.0 ) ) ) * smoothstep( 0.3, 0.7, n2 ) * fadeFine;
			sand = mix( sand, vec3f( 0.52, 0.42, 0.2 ), straw * 0.7 );
			// woods on the far hills: dark, lumpy canopy (the near trees are real geometry)
			let r = length( p );
			let wood = smoothstep( 0.05, 0.25, fbm2( p * 0.0045 + 2.0 ) ) * smoothstep( 420.0, 560.0, r );
			let canopy = fbm2( p * 0.08 ) * 0.5 + 0.5;
			grass = mix( grass, vec3f( 0.03, 0.05, 0.02 ) * ( 0.7 + 0.6 * canopy ), wood );
			// the road from the castle gate: packed earth with two wheel ruts, grass down the middle
			let ra = vec2f( 58.0, -128.0 ); let rb = vec2f( 36.0, -26.0 );
			let rt = clamp( dot( p - ra, rb - ra ) / dot( rb - ra, rb - ra ), 0.0, 1.0 );
			let rd = length( p - ( ra + ( rb - ra ) * rt ) ) + fbm2( p * 0.4 ) * 0.6;
			let road = 1.0 - smoothstep( 2.2, 3.0, rd );
			let rut = smoothstep( 0.5, 0.1, abs( rd - 0.8 ) );
			grass = mix( grass, mix( vec3f( 0.2, 0.15, 0.1 ), vec3f( 0.14, 0.1, 0.07 ), rut ) * ( 0.85 + 0.3 * n3 ), road * ( 1.0 - smoothstep( 0.0, 0.5, rd ) * 0.0 ) * ( 1.0 - 0.6 * smoothstep( 0.35, 0.0, rd ) ) );
			s.albedo = mix( grass, sand, trackMask );
			s.roughness = mix( 0.93, 0.97, trackMask );
			// bump: the churned sand (strong in the lanes) and the grass texture
			let e = 0.02;
			let h0 = churn( p, lane * fadeFine );
			let hx = churn( p + vec2f( e, 0.0 ), lane * fadeFine ) - h0;
			let hz = churn( p + vec2f( 0.0, e ), lane * fadeFine ) - h0;
			let gb = ( blades - 0.5 ) * ( 1.0 - trackMask ) * fadeFine;
			let k = trackMask * fadeFine * ( 0.25 + lane * 0.6 );
			s.normal = normalize( in.N + vec3f( - hx / e * 0.05 * k + gb * 0.35, 0.0, - hz / e * 0.05 * k + gb * 0.2 ) );
			s.ao = mix( 1.0, 0.8 + 0.2 * h, trackMask * lane );
			// grass is a little translucent and sheeny
			s.sheenColor = grass * 0.8 * ( 1.0 - trackMask );
			s.sheenRoughness = 0.6;
		}
	`,
} );

let _mats = null;

export function worldMaterials() {

	if ( _mats ) return _mats;
	_mats = {

		// everything static: stands, fences, the tilt, the castle, trees (the kind rides in the
		// vertex colour's alpha: painted boards, grained wood, masonry, bark, leaves)
		vc: new Material( { name: 'vc', vertexColors: true, roughness: 0.82, modules: [ surfacesModule ],
			surface: 'worldSurface( in, s );' } ),

		// double-sided cloth (tent canvas, awnings): a coarse weave, sun through the thin parts
		cloth: new Material( { name: 'cloth', vertexColors: true, roughness: 0.9, side: 'double', modules: [ surfacesModule ],
			surface: 'canvasSurface( in, s );' } ),

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
				s.alpha = 1.0;
				// linen: a fine weave and a little translucency against the sun
				s.albedo *= 0.93 + 0.07 * sin( in.uv.x * 520.0 ) * sin( in.uv.y * 380.0 );
				s.translucency = s.albedo * 0.25;
			`,
		} ),

		// the ground: meadow grass, and the lists: sand over packed earth, churned by hooves along
		// both lanes, with scattered straw and a worn strip beside the tilt
		ground: new Material( {
			name: 'ground', roughness: 0.95, modules: [ surfacesModule ],
			surface: 'groundSurface( in, s );',
		} ),

		// sky dome: the HDRI panorama (see Environment.js), the sun's disc and glow, and a few
		// drifting fair-weather clouds lit from the sun's side
		sky: new Material( {
			name: 'sky', lit: false, side: 'back', receiveShadows: false,
			modules: [ envModule ],
			surface: /* wgsl */`
				let d = normalize( in.P - frame.cameraPos );
				var c = envRadiance( vec3f( d.x, max( d.y, 0.004 ), d.z ), 0.0 );
				let sd = max( dot( d, frame.sunDir ), 0.0 );
				c += frame.sunColor * ( smoothstep( 0.99994, 0.99997, sd ) * 60.0 + pow( sd, 600.0 ) * 1.2 + pow( sd, 24.0 ) * 0.06 );
				// clouds on a flat layer: soft-edged fbm, thicker and greyer at their cores
				let cp = d.xz / max( d.y + 0.06, 0.03 ) * 0.5 + vec2f( frame.time * 0.004, frame.time * 0.0015 );
				let n = mx_noise_float2( cp * 0.55 ) * 0.55 + mx_noise_float2( cp * 1.3 + 7.1 ) * 0.28 + mx_noise_float2( cp * 3.1 + 2.3 ) * 0.14;
				let cover = smoothstep( 0.18, 0.62, n );
				let core = smoothstep( 0.35, 0.85, n );
				let lit = frame.sunColor * ( 0.16 + 0.12 * pow( sd, 4.0 ) ) + envIrradiance( vec3f( 0.0, 1.0, 0.0 ) ) * 0.9;
				let cloud = mix( lit, lit * 0.62, core );
				c = mix( c, cloud, cover * smoothstep( 0.02, 0.2, d.y ) * 0.9 );
				s.albedo = c;
				s.emissive = vec3f( 0.0 );
			`,
		} ),

		// the crowd: instanced people who jump and wave when excited (see Crowd.js)
		crowd: crowdMaterial(),

	};
	return _mats;

}
