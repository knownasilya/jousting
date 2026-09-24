import { Group, Mesh, InstancedMesh, PlaneGeometry, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, IcosahedronGeometry, Matrix4, Vector3, Quaternion, Euler, Color } from '../engine/index.js';
import { Build, KIND } from './Build.js';
import { terrainGeometry, heightAt, CASTLE } from './Terrain.js';
import { Nature } from './Nature.js';
import { buildCrowd } from './Crowd.js';
import { worldMaterials, slotUV } from './Materials.js';
import { rng as makeRng } from '../game/Rng.js';

// The tournament ground: the lists (a long sandy track split by the tilt barrier), two grandstands
// with a crowd, striped pavilions, banners of the competing houses, woods, hills and a castle.
// The land and the woods are in Terrain.js and Nature.js.
//
// Axes: the tilt runs along x through the origin. The player rides +x on the +z side, the
// opponent -x on the -z side, so each has the barrier on his left, as in a real joust.

export const LISTS = {
	half: 48, // the tilt runs from -half to +half
	standZ: 19,
};

const WOOD = 0x6b4a2c, WOOD_DARK = 0x4a3220, WOOD_LIGHT = 0x9a7650;
const STONE = 0x9c948a, STONE_DARK = 0x7a736a, SLATE = 0x3a4458;
const CANVAS_COLORS = [ 0xb8262a, 0xe9e2d0, 0x1f3f8f, 0xd6a526, 0x2b6b3a, 0x6b2a7a ];

export class Arena {

	constructor( { houses = [ 1, 2, 3, 4, 5 ] } = {} ) {

		this.group = new Group();
		this.houses = houses; // atlas slots shown on the banners
		const M = worldMaterials();
		this.rand = makeRng( 7 );

		const ground = new Mesh( terrainGeometry(), M.ground );
		ground.receiveShadow = true;
		ground.frustumCulled = false;
		this.group.add( ground );

		const sky = new Mesh( new SphereGeometry( 3200, 32, 16 ), M.sky );
		sky.frustumCulled = false;
		this.sky = sky;
		this.group.add( sky );

		const solid = new Build(), cloth = new Build(), banners = new Build();
		this.buildTilt( solid, cloth, banners );
		this.buildListFences( solid );
		this.buildStand( solid, cloth, banners, - LISTS.standZ, true );
		this.buildStand( solid, cloth, banners, LISTS.standZ, false );
		this.buildPavilions( solid, cloth, banners );
		// the castle stands on its levelled mound
		const castle = new Build(), castleBanners = new Build();
		this.buildCastle( castle, castleBanners );
		for ( const [ b, m ] of [ [ castle, M.vc ], [ castleBanners, M.banner ] ] ) {

			const mesh = new Mesh( b.geometry(), m );
			mesh.position.y = heightAt( CASTLE.x, CASTLE.z );
			mesh.castShadow = mesh.receiveShadow = true;
			mesh.frustumCulled = false;
			this.group.add( mesh );

		}

		this.nature = new Nature();
		this.group.add( this.nature.group );

		for ( const [ b, m, shadow ] of [ [ solid, M.vc, true ], [ cloth, M.cloth, true ], [ banners, M.banner, true ] ] ) {

			const mesh = new Mesh( b.geometry(), m );
			mesh.castShadow = shadow;
			mesh.receiveShadow = true;
			mesh.frustumCulled = false;
			this.group.add( mesh );

		}

		this.crowd = this.buildCrowd();
		this.group.add( this.crowd );

	}

	set excitement( v ) {

		worldMaterials().crowd.uniforms.excite.value = v;

	}

	// the tilt: a painted plank barrier on posts, with striped end posts and pennants
	buildTilt( b, cloth, banners ) {

		const H = LISTS.half;
		const box = new BoxGeometry( 1, 1, 1 );
		const seg = 3;
		for ( let x = - H; x < H; x += seg ) {

			const i = Math.round( ( x + H ) / seg );
			b.add( box, i % 2 ? 0xd9c9a0 : 0x9e2226, { p: [ x + seg / 2, 0.78, 0 ], s: [ seg - 0.04, 1.0, 0.1 ] } );
			b.add( box, WOOD_DARK, { k: KIND.wood, p: [ x, 0.7, 0 ], s: [ 0.16, 1.4, 0.2 ] } );

		}

		b.add( box, WOOD, { k: KIND.wood, p: [ 0, 1.34, 0 ], s: [ 2 * H, 0.1, 0.18 ] } );
		b.add( box, WOOD_DARK, { k: KIND.wood, p: [ H, 0.7, 0 ], s: [ 0.16, 1.4, 0.2 ] } );

		// tall striped poles at both ends with a pennant each
		const pole = new CylinderGeometry( 0.07, 0.09, 1, 8 );
		for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

			const px = sx * ( H + 1.5 ), pz = sz * 3.8;
			for ( let k = 0; k < 7; k ++ ) b.add( pole, k % 2 ? 0xe9e2d0 : 0x9e2226, { p: [ px, k * 0.8 + 0.4, pz ], s: [ 1, 0.8, 1 ] } );
			b.add( new SphereGeometry( 0.14, 10, 6 ), 0xd6a526, { k: KIND.gold, p: [ px, 5.7, pz ] } );
			const slot = this.houses[ ( ( sx + 1 ) + ( sz + 1 ) / 2 ) % this.houses.length ];
			banners.add( new PlaneGeometry( 1.0, 1.7, 6, 8 ), 0xffffff, { p: [ px + 0.6 * - sx, 4.6, pz ], r: [ 0, sx > 0 ? Math.PI : 0, 0 ], uv: slotUV( slot, - 0.1, 1.1 ) } );

		}

	}

	buildListFences( b ) {

		const box = new BoxGeometry( 1, 1, 1 );
		const L = 58, Z = 11;
		for ( const sz of [ - 1, 1 ] ) {

			for ( let x = - L; x <= L; x += 4 ) b.add( box, WOOD_DARK, { k: KIND.wood, p: [ x, 0.6, sz * Z ], s: [ 0.14, 1.2, 0.14 ] } );
			b.add( box, WOOD, { k: KIND.wood, p: [ 0, 1.1, sz * Z ], s: [ 2 * L, 0.1, 0.08 ] } );
			b.add( box, WOOD, { k: KIND.wood, p: [ 0, 0.6, sz * Z ], s: [ 2 * L, 0.08, 0.06 ] } );

		}

		for ( const sx of [ - 1, 1 ] ) {

			for ( let z = - Z; z <= Z; z += 4 ) b.add( box, WOOD_DARK, { k: KIND.wood, p: [ sx * L, 0.6, z ], s: [ 0.14, 1.2, 0.14 ] } );
			b.add( box, WOOD, { k: KIND.wood, p: [ sx * L, 1.1, 0 ], s: [ 0.08, 0.1, 2 * Z ] } );

		}

	}

	// a grandstand facing the tilt; `royal` gets a raised centre box with a canopy
	buildStand( b, cloth, banners, z, royal ) {

		const box = new BoxGeometry( 1, 1, 1 );
		const s = Math.sign( z ); // the stand rises away from the tilt
		const len = 44, rows = 5, rise = 0.55, depth = 0.9;
		this.seats = this.seats || [];
		for ( let r = 0; r < rows; r ++ ) {

			const y = 0.9 + r * rise, zz = z + s * r * depth;
			b.add( box, r % 2 ? WOOD : WOOD_LIGHT, { p: [ 0, y, zz ], s: [ len, 0.1, depth ] } ); // walking board
			b.add( box, WOOD_DARK, { k: KIND.wood, p: [ 0, y - rise / 2, zz - s * depth / 2 ], s: [ len, rise, 0.06 ] } ); // riser
			for ( let x = - len / 2 + 0.6; x < len / 2 - 0.3; x += 0.62 ) {

				if ( royal && Math.abs( x ) < 5 && r > 0 ) continue;
				this.seats.push( [ x + ( this.rand() - 0.5 ) * 0.12, y + 0.05, zz + s * 0.1, s ] );

			}

		}

		const topY = 0.9 + rows * rise;
		const backZ = z + s * ( rows - 0.5 ) * depth;
		// supports and the back wall
		for ( let x = - len / 2; x <= len / 2; x += 4 ) {

			b.add( box, WOOD_DARK, { k: KIND.wood, p: [ x, topY / 2 + 1.2, backZ + s * 0.2 ], s: [ 0.2, topY + 2.4, 0.2 ] } );
			b.add( box, WOOD_DARK, { k: KIND.wood, p: [ x, 2.4, z - s * depth * 0.6 ], s: [ 0.18, 4.8, 0.18 ] } );

		}

		b.add( box, WOOD, { k: KIND.wood, p: [ 0, topY / 2 + 1, backZ + s * 0.3 ], s: [ len, topY + 2, 0.12 ] } );
		b.add( box, WOOD, { k: KIND.wood, p: [ 0, 0.45, z - s * depth * 0.55 ], s: [ len, 0.9, 0.1 ] } );

		// striped awning over the whole stand
		const awnY = topY + 2.6;
		const stripes = 22;
		const aw = ( rows + 1.2 ) * depth;
		const pitch = Math.atan2( 1.0, aw );
		for ( let i = 0; i < stripes; i ++ ) {

			const x = - len / 2 + ( i + 0.5 ) * len / stripes;
			const col = i % 2 ? 0xe9e2d0 : ( royal ? 0x1f3f8f : 0x9e2226 );
			cloth.add( box, col, { k: KIND.canvas, p: [ x, awnY - 0.5, z + s * ( aw / 2 - depth ) ], r: [ s * pitch, 0, 0 ], s: [ len / stripes, 0.05, aw + 0.4 ] } );
			// scalloped valance along the front
			cloth.add( new ConeGeometry( len / stripes / 2, 0.45, 3 ), col, { k: KIND.canvas, p: [ x, awnY - 1.45, z - s * depth * 0.65 ], r: [ Math.PI, 0, 0 ], s: [ 1, 1, 0.12 ] } );

		}

		// hanging drapes with the houses' arms on the front of the stand
		for ( let i = 0; i < 9; i ++ ) {

			const x = - len / 2 + 2.4 + i * ( len - 4.8 ) / 8;
			const slot = this.houses[ i % this.houses.length ];
			banners.add( new PlaneGeometry( 1.5, 1.9, 4, 6 ), 0xffffff, { p: [ x, awnY - 2.35, z - s * depth * 0.66 ], r: [ 0, s > 0 ? Math.PI : 0, 0 ], uv: slotUV( slot, - 0.05, 1.05 ) } );

		}

		if ( royal ) {

			// the royal box: a raised dais, a canopy of state and two thrones
			b.add( box, 0x6b1d24, { p: [ 0, 1.6, z + s * 1.6 ], s: [ 9, 0.2, 3.6 ] } );
			b.add( box, 0xd6a526, { k: KIND.gold, p: [ 0, 1.1, z - s * depth * 0.5 ], s: [ 9.2, 1.0, 0.12 ] } );
			for ( const x of [ - 0.9, 0.9 ] ) {

				b.add( box, 0x5a1a20, { p: [ x, 2.1, z + s * 2.0 ], s: [ 0.9, 0.9, 0.8 ] } );
				b.add( box, 0xd6a526, { k: KIND.gold, p: [ x, 2.9, z + s * 2.4 ], s: [ 0.9, 1.7, 0.12 ] } );

			}

			for ( let i = 0; i < 10; i ++ ) cloth.add( box, i % 2 ? 0xd6a526 : 0x6b1d24, { p: [ - 4.5 + ( i + 0.5 ) * 0.9, awnY + 0.35, z + s * 1.6 ], s: [ 0.9, 0.06, 4.4 ] } );
			for ( const x of [ - 4.5, 4.5 ] ) b.add( new CylinderGeometry( 0.1, 0.1, awnY + 0.4, 8 ), 0xd6a526, { k: KIND.gold, p: [ x, ( awnY + 0.4 ) / 2, z - s * 0.4 ] } );
			// royal standard above the box
			b.add( new CylinderGeometry( 0.06, 0.06, 5, 8 ), WOOD_DARK, { k: KIND.wood, p: [ 0, awnY + 2.9, z + s * 3.2 ] } );
			banners.add( new PlaneGeometry( 2.2, 1.4, 8, 4 ), 0xffffff, { p: [ 1.15, awnY + 4.6, z + s * 3.2 ], r: [ 0, s > 0 ? Math.PI : 0, Math.PI / 2 ], s: [ 1, 1, 1 ], uv: slotUV( 7, 0, 1 ) } );

		}

	}

	buildPavilions( b, cloth, banners ) {

		const spots = [
			[ - 66, - 14 ], [ - 70, 0 ], [ - 66, 14 ], [ 66, - 14 ], [ 70, 0 ], [ 66, 14 ],
			[ - 40, - 34 ], [ - 22, - 38 ], [ 26, - 36 ], [ 44, - 32 ], [ - 36, 36 ], [ -16, 40 ], [ 20, 38 ], [ 42, 34 ],
		];
		spots.forEach( ( [ x, z ], i ) => {

			const r = 2.4 + this.rand() * 1.2, h = 2.4 + this.rand() * 0.6, rh = 2.0 + this.rand() * 0.8;
			const c1 = CANVAS_COLORS[ i % CANVAS_COLORS.length ], c2 = i % 3 === 1 ? 0xd6a526 : 0xe9e2d0;
			const n = 12;
			for ( let k = 0; k < n; k ++ ) {

				const col = k % 2 ? c1 : c2;
				const t0 = k * Math.PI * 2 / n, tl = Math.PI * 2 / n;
				cloth.add( new CylinderGeometry( r, r, h, 3, 1, true, t0, tl ), col, { k: KIND.canvas, p: [ x, h / 2, z ] } );
				cloth.add( new ConeGeometry( r * 1.08, rh, 3, 1, true, t0, tl ), col, { k: KIND.canvas, p: [ x, h + rh / 2, z ] } );
				cloth.add( new ConeGeometry( r * 1.08 / n * 3.2, 0.5, 3 ), col, { k: KIND.canvas, p: [ x + Math.sin( t0 + tl / 2 ) * r * 1.07, h - 0.2, z + Math.cos( t0 + tl / 2 ) * r * 1.07 ], r: [ Math.PI, - ( t0 + tl / 2 ), 0 ], s: [ 1, 1, 0.1 ] } );

			}

			// a dark doorway, the centre pole and a pennant
			const toC = Math.atan2( - x, - z );
			b.add( new BoxGeometry( 1.1, 1.9, 0.05 ), 0x241810, { p: [ x + Math.sin( toC ) * r * 0.99, 0.95, z + Math.cos( toC ) * r * 0.99 ], r: [ 0, toC, 0 ] } );
			b.add( new CylinderGeometry( 0.05, 0.05, 1.6, 6 ), WOOD_DARK, { k: KIND.wood, p: [ x, h + rh + 0.7, z ] } );
			b.add( new SphereGeometry( 0.1, 8, 6 ), 0xd6a526, { k: KIND.gold, p: [ x, h + rh + 1.5, z ] } );
			const slot = this.houses[ i % this.houses.length ];
			banners.add( new PlaneGeometry( 1.2, 0.7, 6, 3 ), 0xffffff, { p: [ x + 0.62, h + rh + 1.1, z ], r: [ 0, 0, Math.PI / 2 ], uv: slotUV( slot ) } );

		} );

	}

	buildCastle( b, banners ) {

		const box = new BoxGeometry( 1, 1, 1 );
		const cx = 60, cz = - 190;
		const wall = ( x0, z0, x1, z1, h ) => {

			const len = Math.hypot( x1 - x0, z1 - z0 ), ang = Math.atan2( z1 - z0, x1 - x0 );
			b.add( box, STONE, { k: KIND.stone, p: [ cx + ( x0 + x1 ) / 2, h / 2, cz + ( z0 + z1 ) / 2 ], r: [ 0, - ang, 0 ], s: [ len, h, 3 ] } );
			const n = Math.floor( len / 2.2 );
			for ( let i = 0; i < n; i ++ ) {

				const t = ( i + 0.5 ) / n;
				b.add( box, STONE_DARK, { k: KIND.stone, p: [ cx + x0 + ( x1 - x0 ) * t, h + 0.6, cz + z0 + ( z1 - z0 ) * t ], r: [ 0, - ang, 0 ], s: [ 1.2, 1.2, 3.2 ] } );

			}

		};

		const tower = ( x, z, r, h, slot ) => {

			b.add( new CylinderGeometry( r, r * 1.1, h, 16 ), STONE, { k: KIND.stone, p: [ cx + x, h / 2, cz + z ] } );
			for ( let k = 0; k < 10; k ++ ) {

				const a = k * Math.PI / 5;
				b.add( box, STONE_DARK, { k: KIND.stone, p: [ cx + x + Math.cos( a ) * r * 1.02, h + 0.6, cz + z + Math.sin( a ) * r * 1.02 ], r: [ 0, - a, 0 ], s: [ 1, 1.2, 1.3 ] } );

			}

			b.add( new ConeGeometry( r * 1.15, r * 2.2, 16 ), SLATE, { p: [ cx + x, h + 1.2 + r * 1.1, cz + z ] } );
			b.add( new CylinderGeometry( 0.12, 0.12, 5, 6 ), WOOD_DARK, { k: KIND.wood, p: [ cx + x, h + 1.2 + r * 2.2 + 2, cz + z ] } );
			banners.add( new PlaneGeometry( 4, 2.4, 8, 4 ), 0xffffff, { p: [ cx + x + 2.1, h + r * 2.2 + 3.4, cz + z ], r: [ 0, 0, Math.PI / 2 ], uv: slotUV( slot ) } );
			// arrow slits
			for ( let k = 0; k < 3; k ++ ) b.add( box, 0x1a1612, { p: [ cx + x, h * ( 0.35 + k * 0.2 ), cz + z + r * 1.02 ], s: [ 0.35, 1.3, 0.2 ] } );

		};

		const W = 34, D = 24, h = 14;
		wall( - W, D, W, D, h ); wall( - W, - D, W, - D, h ); wall( - W, - D, - W, D, h ); wall( W, - D, W, D, h );
		tower( - W, D, 5, 22, 7 ); tower( W, D, 5, 22, 7 ); tower( - W, - D, 5, 20, 7 ); tower( W, - D, 5, 20, 7 );
		// the gatehouse and the keep
		b.add( box, STONE, { k: KIND.stone, p: [ cx, 9, cz + D + 2 ], s: [ 12, 18, 6 ] } );
		b.add( box, 0x221a12, { p: [ cx, 3.5, cz + D + 5.05 ], s: [ 5, 7, 0.2 ] } );
		tower( - 7, D + 3, 3.4, 20, 7 ); tower( 7, D + 3, 3.4, 20, 7 );
		b.add( box, STONE, { k: KIND.stone, p: [ cx - 4, 17, cz - 4 ], s: [ 20, 34, 18 ] } );
		for ( let i = 0; i < 8; i ++ ) b.add( box, STONE_DARK, { k: KIND.stone, p: [ cx - 13 + i * 2.6, 34.7, cz + 5.2 ], s: [ 1.3, 1.4, 1.2 ] } );
		tower( 6, - 12, 4.5, 44, 7 );

	}

	buildCrowd() {

		const R = makeRng( 99 );
		const spots = [ ...this.seats ];
		// commoners standing along the lists fences
		for ( const sz of [ - 1, 1 ] ) for ( let x = - 55; x < 55; x += 0.7 ) {

			if ( Math.abs( x ) < 24 || R() < 0.3 ) continue;
			spots.push( [ x + R() * 0.3, 0, sz * ( 11.7 + R() * 1.8 ), sz ] );

		}

		return buildCrowd( spots, worldMaterials().crowd );

	}

}
