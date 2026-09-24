import { GPU, RenderTarget, MeshRenderer, SunShadows, FullscreenPass, UniformBlock, G, setFrameCamera, FrameUniforms, generateMipmaps } from '../engine/webgpu.js';
import { installEnvironmentLighting } from '../world/Environment.js';
import { Matrix4, Vector3 } from '../engine/index.js';

// The frame: sun shadows -> the scene into an HDR target (with a mip chain for the bloom) -> one
// post pass (aerial haze, bloom, tone mapping, grade, vignette, grain, fades) into the output.

export const SCENE_COLORS = [ 'rgba16float', 'rgba16float', 'rgba8unorm' ];

const BLOOM_MIPS = 7;

export class Renderer {

	constructor( { outputFormat = GPU.format } = {} ) {

		// the HDR colour keeps 7 mips: the bloom reads the blurred levels
		this.rt = new RenderTarget( 1, 1, { colors: SCENE_COLORS.map( ( f, i ) => i === 0 ? { format: f, mips: BLOOM_MIPS } : f ), depth: 'depth32float', label: 'scene' } );
		this.meshRenderer = new MeshRenderer();
		this.shadows = new SunShadows( { size: 2048, splits: [ 14, 60, 240 ], lightMargin: 120 } );
		this.post = new UniformBlock( 'Post', {
			fade: [ 'f32', 0 ], // 0..1 to black
			flash: [ 'f32', 0 ], // white impact flash
			vignette: [ 'f32', 0.32 ],
			saturation: [ 'f32', 1.04 ],
			bloom: [ 'f32', 0.045 ],
			grain: [ 'f32', 0.018 ],
		} );
		this.postPass = new FullscreenPass( {
			label: 'post', colorFormats: [ outputFormat ],
			bindings: { hdr: { texture: () => this.rt.textures[ 0 ] }, depth: { texture: () => this.rt.depthTexture }, post: { uniform: this.post } },
			code: /* wgsl */`
				fn aces( x: vec3f ) -> vec3f { return clamp( ( x * ( 2.51 * x + 0.03 ) ) / ( x * ( 2.43 * x + 0.59 ) + 0.14 ), vec3f( 0.0 ), vec3f( 1.0 ) ); }
				fn fragment( in: FSIn ) -> vec4f {
					let dims = vec2f( textureDimensions( hdr ) );
					var c = textureSampleLevel( hdr, smpLinearClamp, in.uv, 0.0 ).rgb;
					let d = textureLoad( depth, vec2i( clamp( in.uv * dims, vec2f( 0.0 ), dims - 1.0 ) ), 0 );
					// aerial haze: warm and light towards the horizon
					// distance to the eye (not view depth: the sky dome sits at one distance all round)
					let vp = frame.invProj * vec4f( in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0, max( d, 1e-7 ), 1.0 );
					let dist = length( vp.xyz / vp.w );
					let haze = ( 1.0 - exp( - max( dist - 60.0, 0.0 ) * 0.0011 ) ) * step( dist, 3000.0 );
					c = mix( c, frame.horizonColor * 1.2, haze * 0.6 );
					// bloom: a soft glow from the blurred mips (bright sun on plate, the sky)
					var b = vec3f( 0.0 );
					b += textureSampleLevel( hdr, smpLinearClamp, in.uv, 2.0 ).rgb * 0.3;
					b += textureSampleLevel( hdr, smpLinearClamp, in.uv, 3.0 ).rgb * 0.25;
					b += textureSampleLevel( hdr, smpLinearClamp, in.uv, 4.0 ).rgb * 0.2;
					b += textureSampleLevel( hdr, smpLinearClamp, in.uv, 5.0 ).rgb * 0.15;
					b += textureSampleLevel( hdr, smpLinearClamp, in.uv, 6.0 ).rgb * 0.1;
					c = c + max( b - vec3f( 0.6 ), vec3f( 0.0 ) ) * post.bloom * 4.0 + b * post.bloom;
					c *= frame.exposure;
					c = aces( c );
					let l = luminance( c );
					c = mix( vec3f( l ), c, post.saturation );
					let q = in.uv - 0.5;
					c *= 1.0 - post.vignette * dot( q, q ) * 1.6;
					// a warm, slightly lifted film look: cool shadows, warm highlights
					c = pow( c, vec3f( 1.04 ) );
					c = mix( c * vec3f( 0.96, 0.99, 1.04 ), c * vec3f( 1.03, 1.0, 0.95 ), smoothstep( 0.0, 0.6, l ) );
					let g = fract( sin( dot( in.uv * dims + frame.time * vec2f( 61.0, 37.0 ), vec2f( 12.9898, 78.233 ) ) ) * 43758.5453 ) - 0.5;
					c += g * post.grain;
					c = mix( c, vec3f( 1.0, 0.97, 0.9 ), post.flash );
					c *= 1.0 - post.fade;
					return vec4f( linearToSrgb( sat3( c ) ), 1.0 );
				}
			`,
		} );
		installEnvironmentLighting();
		this.prevViewProj = new Matrix4();
		this.prevCamPos = new Vector3();
		this.width = 1;
		this.height = 1;

		// a warm afternoon
		G.sunDir.value.set( - 0.5, 0.52, 0.6 ).normalize();
		G.sunColor.value.setRGB( 3.6, 3.2, 2.7 );
		G.skyIrradiance.value.setRGB( 0.32, 0.4, 0.52 );
		G.horizonColor.value.setRGB( 0.62, 0.66, 0.72 );
		G.exposure.value = 0.85;

	}

	setSize( w, h ) {

		this.width = w;
		this.height = h;
		this.rt.setSize( w, h );

	}

	render( scene, camera, outputView ) {

		const { width: w, height: h } = this;
		setFrameCamera( camera, w, h, { prevViewProj: this.prevViewProj, prevCameraPos: this.prevCamPos } );
		this.shadows.render( scene, this.meshRenderer, this.shadows.update( camera, G.sunDir.value ) );
		// the shadow passes write camera fields of their own blocks; restore the main view
		setFrameCamera( camera, w, h, { prevViewProj: this.prevViewProj, prevCameraPos: this.prevCamPos } );
		this.meshRenderer.render( scene, {
			camera, kind: 'main', colorViews: this.rt.textures.map( ( t ) => t.mipLevelCount > 1 ? t.view( { baseMipLevel: 0, mipLevelCount: 1 } ) : t.view() ), colorFormats: SCENE_COLORS,
			clearColors: [ [ 0.5, 0.6, 0.7, 1 ], [ 0, 0, 0, 0 ], [ 0, 0, 0, 0 ] ], depthView: this.rt.depthTexture.view(), depthFormat: 'depth32float', clearDepth: 0,
		} );
		generateMipmaps( this.rt.textures[ 0 ] );
		this.postPass.render( { colorViews: [ outputView ] } );
		this.prevViewProj.copy( FrameUniforms.fields.viewProjNoJitter.value );
		this.prevCamPos.copy( FrameUniforms.fields.cameraPos.value );

	}

}
