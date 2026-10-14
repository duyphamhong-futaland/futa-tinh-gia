<?php
/**
 * FUTA Land — Xoá nhãn AI khỏi ảnh · lõi PHP
 * Bản chuyển 1-1 từ remove-ai/js/meta.js: cắt bỏ khối metadata khỏi JPEG / PNG / WebP / GIF
 * mà KHÔNG nén lại ảnh (điểm ảnh giữ nguyên), và quét nhanh dấu vết AI.
 */

defined( 'ABSPATH' ) || exit;

final class FUTA_AI_Meta {

	/** Mẫu nhận diện công cụ AI → tên hiển thị (giống AI_TOOLS bên JS). */
	const AI_TOOLS = array(
		'/dall[\s._-]?e\b|dall\xC2\xB7e/i'                                                   => 'DALL·E (OpenAI)',
		'/chat\s?gpt|gpt[\s_-]?image|gpt-4o|\bopenai\b|\bsora\b/i'                          => 'OpenAI · ChatGPT',
		'/midjourney/i'                                                                     => 'Midjourney',
		'/firefly/i'                                                                        => 'Adobe Firefly',
		'/generative\s?(fill|expand)/i'                                                     => 'Photoshop Generative Fill',
		'/stable[\s_-]?diffusion|\bsdxl\b|stability\.?ai/i'                                 => 'Stable Diffusion',
		'/comfy\s?ui/i'                                                                     => 'ComfyUI',
		'/automatic1111|\ba1111\b/i'                                                        => 'Stable Diffusion WebUI',
		'/invoke\s?ai/i'                                                                    => 'InvokeAI',
		'/novel\s?ai/i'                                                                     => 'NovelAI',
		'/leonardo[\s.]?ai/i'                                                               => 'Leonardo.Ai',
		'/ideogram/i'                                                                       => 'Ideogram',
		'/\bimagen\b/i'                                                                     => 'Google Imagen',
		'/gemini|nano[\s-]?banana|\bbard\b/i'                                               => 'Google Gemini',
		'/(made|edited|created) with google ai|\bgoogle\s?ai\b/i'                           => 'Google AI',
		'/synthid/i'                                                                        => 'Google SynthID',
		'/\bmeta\s?ai\b|imagine with meta/i'                                                => 'Meta AI',
		'/\bgrok\b|\bx\.ai\b|\bxai\b/i'                                                     => 'Grok (xAI)',
		'/\bflux(\.\d)?\b|black\s?forest\s?labs/i'                                          => 'FLUX',
		'/bing image creator|image creator from (bing|microsoft)|microsoft designer|\bcopilot\b/i' => 'Microsoft Copilot / Designer',
		'/magic media|dream lab/i'                                                          => 'Canva AI',
		'/runway\s?(ml|gen)/i'                                                              => 'Runway',
		'/\bkling\b/i'                                                                      => 'Kling AI',
		'/playground\s?(ai|v\d)/i'                                                          => 'Playground AI',
		'/recraft/i'                                                                        => 'Recraft',
		'/seedream|dreamina|jimeng/i'                                                       => 'ByteDance Seedream',
		'/\bkrea\b/i'                                                                       => 'Krea',
		'/galaxy\s?ai/i'                                                                    => 'Samsung Galaxy AI',
		'/image\s?playground/i'                                                             => 'Apple Image Playground',
		'/hunyuan/i'                                                                        => 'Tencent Hunyuan',
		'/qwen[\s-]?image|tongyi|\bwanx\b/i'                                                => 'Alibaba Qwen / Tongyi',
		'/\bai[\s-]generated\b|generated (by|with) ai|made with ai|created (by|with) ai/i'  => 'Gắn cờ “AI generated”',
	);

	/** Mã IPTC Digital Source Type mà Meta/TikTok… dùng để gắn nhãn AI. */
	const AI_SOURCE_TYPES = array( 'trainedAlgorithmicMedia', 'compositeWithTrainedAlgorithmicMedia', 'algorithmicMedia', 'compositeSynthetic' );

	const PNG_KEEP  = array( 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT', 'pHYs', 'bKGD', 'hIST', 'acTL', 'fcTL', 'fdAT', 'cICP', 'mDCv', 'cLLI' );
	const WEBP_KEEP = array( 'VP8X', 'ANIM', 'ANMF', 'ALPH', 'VP8 ', 'VP8L' );

	/* ---------- Tiện ích byte ---------- */
	private static function u16( $b, $o ) { return ( ord( $b[ $o ] ) << 8 ) | ord( $b[ $o + 1 ] ); }
	private static function u32( $b, $o ) { $v = unpack( 'N', substr( $b, $o, 4 ) ); return $v[1]; }
	private static function u32le( $b, $o ) { $v = unpack( 'V', substr( $b, $o, 4 ) ); return $v[1]; }

	/* ---------- Định dạng ---------- */
	public static function detect_format( $b ) {
		if ( strlen( $b ) < 12 ) {
			return 'unknown';
		}
		if ( "\xFF\xD8\xFF" === substr( $b, 0, 3 ) ) {
			return 'jpeg';
		}
		if ( "\x89PNG" === substr( $b, 0, 4 ) ) {
			return 'png';
		}
		if ( 'RIFF' === substr( $b, 0, 4 ) && 'WEBP' === substr( $b, 8, 4 ) ) {
			return 'webp';
		}
		if ( 'GIF8' === substr( $b, 0, 4 ) ) {
			return 'gif';
		}
		if ( 'ftyp' === substr( $b, 4, 4 ) ) {
			$brands = substr( $b, 8, max( 0, min( self::u32( $b, 0 ), 64 ) - 8 ) );
			if ( preg_match( '/avi[fs]/', $brands ) ) {
				return 'avif';
			}
			if ( preg_match( '/hei[cxms]|hev[cxms]|mif1|msf1/', $brands ) ) {
				return 'heic';
			}
		}
		return 'unknown';
	}

	public static function can_strip( $format ) {
		return in_array( $format, array( 'jpeg', 'png', 'webp', 'gif' ), true );
	}

	/**
	 * Cắt bỏ metadata. Trả về chuỗi byte mới, hoặc null nếu định dạng không hỗ trợ.
	 */
	public static function strip( $b, $keep_orientation = true, $keep_icc = true ) {
		switch ( self::detect_format( $b ) ) {
			case 'jpeg':
				return self::strip_jpeg( $b, $keep_orientation, $keep_icc );
			case 'png':
				return self::strip_png( $b, $keep_orientation, $keep_icc );
			case 'webp':
				return self::strip_webp( $b, $keep_orientation, $keep_icc );
			case 'gif':
				return self::strip_gif( $b, $keep_icc );
		}
		return null;
	}

	/* ---------- EXIF: chỉ cần hướng xoay + có GPS hay không ---------- */
	private static function tiff_info( $b, $s, $e ) {
		$res = array( 'orientation' => 1, 'gps' => false, 'minimal' => false ); // minimal = chỉ có hướng xoay
		if ( $e - $s < 8 ) {
			return $res;
		}
		$t  = substr( $b, $s, $e - $s );
		$bo = substr( $t, 0, 2 );
		if ( 'II' !== $bo && 'MM' !== $bo ) {
			return $res;
		}
		$le  = 'II' === $bo;
		$n16 = function ( $o ) use ( $t, $le ) { $v = unpack( $le ? 'v' : 'n', substr( $t, $o, 2 ) ); return $v[1]; };
		$n32 = function ( $o ) use ( $t, $le ) { $v = unpack( $le ? 'V' : 'N', substr( $t, $o, 4 ) ); return $v[1]; };
		$len = strlen( $t );
		if ( 42 !== $n16( 2 ) ) {
			return $res;
		}
		$off = $n32( 4 );
		if ( ! $off || $off + 2 > $len ) {
			return $res;
		}
		$cnt   = $n16( $off );
		$other = false;
		for ( $i = 0; $i < $cnt; $i++ ) {
			$p = $off + 2 + $i * 12;
			if ( $p + 12 > $len ) {
				break;
			}
			$tag = $n16( $p );
			if ( 0x0112 === $tag ) {
				$type = $n16( $p + 2 );
				$o    = 3 === $type ? $n16( $p + 8 ) : ( 4 === $type ? $n32( $p + 8 ) : ord( $t[ $p + 8 ] ) );
				if ( $o >= 1 && $o <= 8 ) {
					$res['orientation'] = $o;
				}
			} elseif ( 0x8825 === $tag ) {
				$res['gps'] = true;
			}
			if ( 0x0112 !== $tag && 0x0213 !== $tag ) {
				$other = true;
			}
		}
		$q = $off + 2 + $cnt * 12;
		$res['minimal'] = ! $other && ( $q + 4 > $len || 0 === $n32( $q ) );
		return $res;
	}

	/** TIFF tối giản chỉ chứa Orientation (+ YCbCrPositioning) — giống tiffOrientation() bên JS. */
	private static function tiff_orientation( $o ) {
		return "MM\x00\x2A\x00\x00\x00\x08\x00\x02"
			. "\x01\x12\x00\x03\x00\x00\x00\x01\x00" . chr( $o ) . "\x00\x00"
			. "\x02\x13\x00\x03\x00\x00\x00\x01\x00\x01\x00\x00"
			. "\x00\x00\x00\x00";
	}

	/* ---------- JPEG ---------- */
	private static function jpeg_segments( $b ) {
		$n    = strlen( $b );
		$i    = 2;
		$segs = array();
		$end  = -1;
		$bad  = false;
		while ( $i + 1 < $n ) {
			if ( 0xFF !== ord( $b[ $i ] ) ) {
				$bad = true;
				break;
			}
			$m = ord( $b[ $i + 1 ] );
			if ( 0xFF === $m ) {
				$i++;
				continue;
			}
			if ( 0xD9 === $m ) {
				$end = $i + 2;
				break;
			}
			if ( ( $m >= 0xD0 && $m <= 0xD7 ) || 0x01 === $m ) {
				$segs[] = array( $m, $i, $i + 2, $i + 2 );
				$i     += 2;
				continue;
			}
			if ( $i + 4 > $n ) {
				break;
			}
			$e   = min( $n, $i + 2 + self::u16( $b, $i + 2 ) );
			$seg = array( $m, $i, $e, $i + 4 );
			$i   = $e;
			if ( 0xDA === $m ) { // SOS → gộp dữ liệu ảnh nén phía sau
				$j = $i;
				while ( true ) {
					$j = strpos( $b, "\xFF", $j );
					if ( false === $j || $j + 1 >= $n ) {
						$j = $n;
						break;
					}
					$x = ord( $b[ $j + 1 ] );
					if ( 0 !== $x && 0xFF !== $x && ( $x < 0xD0 || $x > 0xD7 ) ) {
						break;
					}
					$j++;
				}
				$seg[2] = $j;
				$i      = $j;
			}
			$segs[] = $seg;
		}
		return array( $segs, $end > 0 ? $end : $i, $bad );
	}

	private static function jpeg_kind( $b, $seg ) {
		list( $m, , $e, $d ) = $seg;
		$sig = function ( $k ) use ( $b, $d, $e ) { return (string) substr( $b, $d, min( $k, max( 0, $e - $d ) ) ); };
		if ( 0xE0 === $m ) {
			$s = $sig( 5 );
			return "JFIF\0" === $s ? 'jfif' : ( "JFXX\0" === $s ? 'jfxx' : 'app' );
		}
		if ( 0xE1 === $m ) {
			$s = $sig( 35 );
			if ( 0 === strncmp( $s, "Exif\0", 5 ) ) {
				return 'exif';
			}
			if ( 0 === strncmp( $s, "http://ns.adobe.com/xap/1.0/\0", 29 ) ) {
				return 'xmp';
			}
			return 0 === strncmp( $s, "http://ns.adobe.com/xmp/extension/\0", 35 ) ? 'xmpx' : 'app';
		}
		if ( 0xE2 === $m ) {
			$s = $sig( 12 );
			return "ICC_PROFILE\0" === $s ? 'icc' : ( 0 === strncmp( $s, "MPF\0", 4 ) ? 'mpf' : 'app' );
		}
		if ( 0xEB === $m ) {
			return 'JP' === $sig( 2 ) ? 'jumbf' : 'app';
		}
		if ( 0xED === $m ) {
			return "Photoshop 3.0\0" === $sig( 14 ) ? 'iptc' : 'app';
		}
		if ( 0xEE === $m ) {
			return 'Adobe' === $sig( 5 ) ? 'adobe' : 'app';
		}
		if ( $m >= 0xE0 && $m <= 0xEF ) {
			return 'app';
		}
		return 0xFE === $m ? 'com' : 'img';
	}

	private static function strip_jpeg( $b, $keep_ori, $keep_icc ) {
		list( $segs, $end, $bad ) = self::jpeg_segments( $b );
		$ori = 1;
		foreach ( $segs as $s ) {
			if ( 'exif' === self::jpeg_kind( $b, $s ) ) {
				$info = self::tiff_info( $b, $s[3] + 6, $s[2] );
				$ori  = $info['orientation'];
				break;
			}
		}
		$ori_done = ! ( $keep_ori && $ori > 1 );
		$out      = substr( $b, 0, 2 );
		foreach ( $segs as $s ) {
			$k = self::jpeg_kind( $b, $s );
			if ( ! ( 'img' === $k || 'jfif' === $k || 'adobe' === $k || ( 'icc' === $k && $keep_icc ) ) ) {
				continue;
			}
			if ( ! $ori_done && 'jfif' !== $k ) {
				$t        = self::tiff_orientation( $ori );
				$out     .= "\xFF\xE1" . pack( 'n', 8 + strlen( $t ) ) . "Exif\0\0" . $t;
				$ori_done = true;
			}
			$out .= substr( $b, $s[1], $s[2] - $s[1] );
		}
		return $out . ( $bad ? substr( $b, $end ) : "\xFF\xD9" );
	}

	/* ---------- PNG ---------- */
	private static function png_chunks( $b ) {
		$n      = strlen( $b );
		$i      = 8;
		$chunks = array();
		$end    = -1;
		while ( $i + 12 <= $n ) {
			$len = self::u32( $b, $i );
			$e   = $i + 12 + $len;
			if ( $e > $n ) {
				break;
			}
			$type     = substr( $b, $i + 4, 4 );
			$chunks[] = array( $type, $i, $i + 8, $i + 8 + $len, $e );
			$i        = $e;
			if ( 'IEND' === $type ) {
				$end = $e;
				break;
			}
		}
		return array( $chunks, $end > 0 ? $end : $i );
	}

	private static function png_chunk( $type, $data ) {
		return pack( 'N', strlen( $data ) ) . $type . $data . pack( 'N', crc32( $type . $data ) );
	}

	private static function strip_png( $b, $keep_ori, $keep_icc ) {
		list( $chunks, $end ) = self::png_chunks( $b );
		$ori = 1;
		foreach ( $chunks as $c ) {
			if ( 'eXIf' === $c[0] ) {
				$info = self::tiff_info( $b, $c[2], $c[3] );
				$ori  = $info['orientation'];
			}
		}
		$ori_done = ! ( $keep_ori && $ori > 1 );
		$out      = substr( $b, 0, 8 );
		foreach ( $chunks as $c ) {
			$critical = 0 === ( ord( $c[0][0] ) & 0x20 );
			if ( 'IDAT' === $c[0] && ! $ori_done ) {
				$out     .= self::png_chunk( 'eXIf', self::tiff_orientation( $ori ) );
				$ori_done = true;
			}
			if ( $critical || in_array( $c[0], self::PNG_KEEP, true ) || ( 'iCCP' === $c[0] && $keep_icc ) ) {
				$out .= substr( $b, $c[1], $c[4] - $c[1] );
			}
		}
		$last = end( $chunks );
		if ( ! $last || 'IEND' !== $last[0] ) {
			$out .= substr( $b, $end ); // file cụt: giữ nguyên phần còn lại
		}
		return $out;
	}

	/* ---------- WebP (RIFF) ---------- */
	private static function riff_chunks( $b ) {
		$len    = strlen( $b );
		$n      = min( $len, 8 + self::u32le( $b, 4 ) );
		$i      = 12;
		$chunks = array();
		while ( $i + 8 <= $n ) {
			$size     = self::u32le( $b, $i + 4 );
			$d        = $i + 8;
			$e        = min( $d + $size + ( $size & 1 ), $len );
			$chunks[] = array( substr( $b, $i, 4 ), $i, $d, min( $d + $size, $len ), $e );
			$i        = $e;
		}
		return array( $chunks, $n );
	}

	private static function webp_exif_info( $b, $c ) {
		$s = "Exif\0\0" === substr( $b, $c[2], 6 ) ? $c[2] + 6 : $c[2];
		return self::tiff_info( $b, $s, $c[3] );
	}

	private static function strip_webp( $b, $keep_ori, $keep_icc ) {
		list( $chunks ) = self::riff_chunks( $b );
		$ori            = 1;
		foreach ( $chunks as $c ) {
			if ( 'EXIF' === $c[0] ) {
				$info = self::webp_exif_info( $b, $c );
				$ori  = $info['orientation'];
			}
		}
		$body = '';
		$vp8x = -1;
		$icc  = false;
		foreach ( $chunks as $c ) {
			if ( ! ( in_array( $c[0], self::WEBP_KEEP, true ) || ( 'ICCP' === $c[0] && $keep_icc ) ) ) {
				continue;
			}
			if ( 'VP8X' === $c[0] ) {
				$vp8x = strlen( $body );
			}
			if ( 'ICCP' === $c[0] ) {
				$icc = true;
			}
			$body .= substr( $b, $c[1], $c[4] - $c[1] );
		}
		$add_ori = $vp8x >= 0 && $keep_ori && $ori > 1;
		if ( $add_ori ) {
			$t     = self::tiff_orientation( $ori );
			$body .= 'EXIF' . pack( 'V', strlen( $t ) ) . $t;
		}
		if ( $vp8x >= 0 ) { // cờ ICC / EXIF / XMP trong VP8X
			$f                 = ord( $body[ $vp8x + 8 ] ) & ~( 0x20 | 0x08 | 0x04 );
			$f                |= ( $icc ? 0x20 : 0 ) | ( $add_ori ? 0x08 : 0 );
			$body[ $vp8x + 8 ] = chr( $f );
		}
		return 'RIFF' . pack( 'V', strlen( $body ) + 4 ) . 'WEBP' . $body;
	}

	/* ---------- GIF ---------- */
	private static function gif_blocks( $b ) {
		$n      = strlen( $b );
		$blocks = array();
		$i      = 13;
		if ( ord( $b[10] ) & 0x80 ) {
			$i += 3 << ( ( ord( $b[10] ) & 7 ) + 1 );
		}
		$blocks[] = array( 'head', 0, min( $i, $n ), 0, '' );
		$subs     = function ( $j ) use ( $b, $n ) {
			while ( $j < $n && 0 !== ord( $b[ $j ] ) ) {
				$j += ord( $b[ $j ] ) + 1;
			}
			return min( $j + 1, $n );
		};
		while ( $i < $n ) {
			$c = ord( $b[ $i ] );
			if ( 0x3B === $c ) {
				$blocks[] = array( 'end', $i, $i + 1, 0, '' );
				break;
			}
			if ( 0x21 === $c && $i + 2 < $n ) {
				$label    = ord( $b[ $i + 1 ] );
				$app      = 0xFF === $label ? (string) substr( $b, $i + 3, min( 11, ord( $b[ $i + 2 ] ) ) ) : '';
				$e        = $subs( $i + 2 );
				$blocks[] = array( 'ext', $i, $e, $label, $app );
				$i        = $e;
				continue;
			}
			if ( 0x2C === $c && $i + 10 < $n ) {
				$j = $i + 10;
				if ( ord( $b[ $i + 9 ] ) & 0x80 ) {
					$j += 3 << ( ( ord( $b[ $i + 9 ] ) & 7 ) + 1 );
				}
				$e        = $subs( $j + 1 );
				$blocks[] = array( 'img', $i, $e, 0, '' );
				$i        = $e;
				continue;
			}
			$blocks[] = array( 'junk', $i, $n, 0, '' );
			break;
		}
		return $blocks;
	}

	private static function gif_keep( $blk, $keep_icc ) {
		list( , , , $label, $app ) = $blk;
		return 0xF9 === $label || 0x01 === $label
			|| ( 0xFF === $label && ( preg_match( '/^(NETSCAPE2\.0|ANIMEXTS1\.0)/', $app ) || ( $keep_icc && 0 === strncmp( $app, 'ICCRGBG1', 8 ) ) ) );
	}

	private static function strip_gif( $b, $keep_icc ) {
		$blocks = self::gif_blocks( $b );
		$out    = '';
		foreach ( $blocks as $blk ) {
			if ( 'ext' !== $blk[0] || self::gif_keep( $blk, $keep_icc ) ) {
				$out .= substr( $b, $blk[1], $blk[2] - $blk[1] );
			}
		}
		$last = end( $blocks );
		return 'end' === $last[0] ? $out : $out . ';';
	}

	/* ---------- Quét nhanh dấu vết AI / metadata ---------- */

	/**
	 * @return array{format:string, ai:bool, ai_labels:string[], meta_labels:string[]}
	 */
	public static function scan( $b ) {
		$fmt  = self::detect_format( $b );
		$text = '';   // văn bản lấy từ các khối metadata
		$ai   = array();
		$meta = array();
		$c2pa = false;
		$add  = function ( &$arr, $v ) { if ( ! in_array( $v, $arr, true ) ) { $arr[] = $v; } };

		if ( 'jpeg' === $fmt ) {
			list( $segs, $end, $bad ) = self::jpeg_segments( $b );
			foreach ( $segs as $s ) {
				$k = self::jpeg_kind( $b, $s );
				if ( in_array( $k, array( 'img', 'jfif', 'adobe', 'icc' ), true ) ) {
					continue;
				}
				$raw = substr( $b, $s[3], $s[2] - $s[3] );
				if ( 'jumbf' === $k ) {
					$c2pa = true;
				} elseif ( 'exif' === $k ) {
					$info = self::tiff_info( $b, $s[3] + 6, $s[2] );
					if ( ! $info['minimal'] ) {
						$add( $meta, 'EXIF' );
					}
					if ( $info['gps'] ) {
						$add( $meta, 'GPS' );
					}
				} else {
					$add( $meta, array( 'xmp' => 'XMP', 'xmpx' => 'XMP', 'iptc' => 'IPTC', 'com' => 'Comment', 'mpf' => 'MPF', 'jfxx' => 'Thumbnail' )[ $k ] ?? 'APP' );
				}
				$text .= self::readable( $raw ) . "\n";
			}
			if ( ! $bad && $end < strlen( $b ) ) {
				$add( $meta, 'Trailer' );
				$text .= self::readable( substr( $b, $end ) );
				if ( false !== strpos( substr( $b, $end ), 'c2pa' ) ) {
					$c2pa = true;
				}
			}
		} elseif ( 'png' === $fmt ) {
			list( $chunks ) = self::png_chunks( $b );
			foreach ( $chunks as $c ) {
				$t = $c[0];
				if ( 0 === ( ord( $t[0] ) & 0x20 ) || in_array( $t, self::PNG_KEEP, true ) || 'iCCP' === $t ) {
					continue;
				}
				$raw = substr( $b, $c[2], $c[3] - $c[2] );
				if ( 'caBX' === $t ) {
					$c2pa = true;
				} elseif ( 'eXIf' === $t ) {
					$info = self::tiff_info( $b, $c[2], $c[3] );
					if ( ! $info['minimal'] ) {
						$add( $meta, 'EXIF' );
					}
					if ( $info['gps'] ) {
						$add( $meta, 'GPS' );
					}
				} elseif ( in_array( $t, array( 'tEXt', 'zTXt', 'iTXt' ), true ) ) {
					$add( $meta, 'PNG text' );
					$raw = self::png_text( $t, $raw );
					if ( preg_match( '/^(parameters|prompt|workflow|invokeai_metadata|invokeai_graph|dream|sd-metadata|generation_data)\0/i', $raw ) ) {
						$add( $ai, 'Prompt tạo ảnh AI' );
					}
				} else {
					$add( $meta, $t );
				}
				$text .= self::readable( $raw ) . "\n";
			}
		} elseif ( 'webp' === $fmt ) {
			list( $chunks ) = self::riff_chunks( $b );
			foreach ( $chunks as $c ) {
				if ( in_array( $c[0], self::WEBP_KEEP, true ) || 'ICCP' === $c[0] ) {
					continue;
				}
				if ( 'C2PA' === $c[0] ) {
					$c2pa = true;
				} elseif ( 'EXIF' === $c[0] ) {
					$info = self::webp_exif_info( $b, $c );
					if ( ! $info['minimal'] ) {
						$add( $meta, 'EXIF' );
					}
					if ( $info['gps'] ) {
						$add( $meta, 'GPS' );
					}
				} else {
					$add( $meta, trim( $c[0] ) );
				}
				$text .= self::readable( substr( $b, $c[2], $c[3] - $c[2] ) ) . "\n";
			}
		} elseif ( 'gif' === $fmt ) {
			foreach ( self::gif_blocks( $b ) as $blk ) {
				if ( 'ext' !== $blk[0] || self::gif_keep( $blk, true ) ) {
					continue;
				}
				$add( $meta, 0xFE === $blk[3] ? 'Comment' : ( 'XMP DataXMP' === $blk[4] ? 'XMP' : 'GIF ext' ) );
				$text .= self::readable( substr( $b, $blk[1], $blk[2] - $blk[1] ) ) . "\n";
			}
		} else { // AVIF / HEIC / khác: quét gói XMP + hộp C2PA trong toàn file
			if ( preg_match_all( '/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/', $b, $m ) ) {
				$add( $meta, 'XMP' );
				$text .= implode( "\n", $m[0] ) . "\n";
			}
			$j = strpos( $b, 'jumb' );
			if ( false !== $j && $j >= 4 && false !== strpos( $b, 'c2pa', $j ) ) {
				$c2pa  = true;
				$len   = self::u32( $b, $j - 4 );
				$text .= self::readable( substr( $b, $j - 4, $len > 8 ? $len : 1 << 20 ) ) . "\n";
			}
			if ( false !== strpos( $b, "Exif\0\0" ) ) {
				$add( $meta, 'EXIF' );
			}
		}

		$src_ai = false;
		if ( preg_match_all( '/digitalsourcetype\/([A-Za-z]+)/i', $text, $m ) ) {
			foreach ( array_unique( $m[1] ) as $code ) {
				if ( in_array( $code, self::AI_SOURCE_TYPES, true ) ) {
					$src_ai = true;
					$add( $ai, 'IPTC: ' . $code );
				}
			}
		}
		$tools = array();
		foreach ( self::AI_TOOLS as $re => $name ) {
			if ( preg_match( $re, $text ) ) {
				$tools[] = $name;
			}
		}
		if ( preg_match( '/\bSteps: ?\d+,[\s\S]*?\b(Sampler|CFG scale|Seed):/', $text ) ) {
			$add( $ai, 'Prompt Stable Diffusion' );
		}
		if ( $c2pa ) {
			if ( $src_ai || $tools ) {
				array_unshift( $ai, 'C2PA' );
			} else {
				$add( $meta, 'C2PA' );
			}
		}
		foreach ( $tools as $t ) {
			$add( $ai, $t );
		}
		return array(
			'format'      => $fmt,
			'ai'          => (bool) $ai,
			'ai_labels'   => $ai,
			'meta_labels' => $meta,
		);
	}

	/** Giải nén zTXt / iTXt (nếu nén) thành "key\0text". */
	private static function png_text( $type, $raw ) {
		$z = strpos( $raw, "\0" );
		if ( false === $z ) {
			return $raw;
		}
		$key = substr( $raw, 0, $z );
		if ( 'zTXt' === $type ) {
			$v = function_exists( 'gzuncompress' ) ? @gzuncompress( substr( $raw, $z + 2 ) ) : false;
			return $key . "\0" . ( false === $v ? '' : $v );
		}
		if ( 'iTXt' === $type && isset( $raw[ $z + 1 ] ) && "\x01" === $raw[ $z + 1 ] ) {
			$p = strpos( $raw, "\0", $z + 3 );
			$p = false === $p ? false : strpos( $raw, "\0", $p + 1 );
			$v = ( false !== $p && function_exists( 'gzuncompress' ) ) ? @gzuncompress( substr( $raw, $p + 1 ) ) : false;
			return $key . "\0" . ( false === $v ? '' : $v );
		}
		return $raw;
	}

	/** Chuỗi ký tự in được (≥4) — bỏ byte 0 trước để đọc được cả UTF-16 (UserComment). */
	private static function readable( $raw ) {
		preg_match_all( '/[\x20-\x7E]{4,}/', str_replace( array( "\0", "\xC2\xB7" ), array( '', '.' ), $raw ), $m );
		return implode( "\n", $m[0] );
	}
}
