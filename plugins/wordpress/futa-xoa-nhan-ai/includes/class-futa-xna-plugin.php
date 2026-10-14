<?php
/**
 * FUTA Land — Xoá nhãn AI khỏi ảnh · tích hợp WordPress
 * - Tự xoá metadata AI khi ảnh được tải lên (Thư viện, REST API, sideload)
 * - Cột “Nhãn AI” + nút “Xoá ngay” trong Thư viện, thao tác hàng loạt, ô trạng thái trong cửa sổ chi tiết ảnh
 * - Trang Media → Xoá nhãn AI: quét toàn bộ thư viện + công cụ xử lý ảnh ngay trên trình duyệt
 * - Cài đặt nằm ở Cài đặt → Media
 */

defined( 'ABSPATH' ) || exit;

final class FUTA_XNA_Plugin {

	const OPT   = 'futa_xna_options';
	const META  = '_futa_xna';
	const SLUG  = 'futa-xoa-nhan-ai';
	const QARGS = array( 'futa_xna_done', 'futa_xna_ai', 'futa_xna_saved', 'futa_xna_skip' );

	/** Kết quả xử lý lúc upload, chờ gắn vào attachment (khoá = đường dẫn file). */
	private static $pending = array();

	public static function init() {
		add_filter( 'wp_handle_upload', array( __CLASS__, 'on_upload' ), 5 );
		add_action( 'add_attachment', array( __CLASS__, 'on_add_attachment' ) );
		add_filter( 'wp_generate_attachment_metadata', array( __CLASS__, 'on_generate_metadata' ), 20, 2 );
		add_filter( 'attachment_fields_to_edit', array( __CLASS__, 'attachment_fields' ), 10, 2 );

		if ( is_admin() ) {
			add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
			add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ) );
			add_action( 'admin_head', array( __CLASS__, 'admin_css' ) );
			add_action( 'admin_notices', array( __CLASS__, 'notices' ) );
			add_filter( 'manage_media_columns', array( __CLASS__, 'add_column' ) );
			add_action( 'manage_media_custom_column', array( __CLASS__, 'render_column' ), 10, 2 );
			add_filter( 'bulk_actions-upload', array( __CLASS__, 'bulk_actions' ) );
			add_filter( 'handle_bulk_actions-upload', array( __CLASS__, 'handle_bulk' ), 10, 3 );
			add_action( 'admin_post_futa_xna_clean', array( __CLASS__, 'handle_single' ) );
			add_action( 'wp_ajax_futa_xna_batch', array( __CLASS__, 'ajax_batch' ) );
			add_filter( 'plugin_action_links_' . plugin_basename( FUTA_XNA_FILE ), array( __CLASS__, 'action_links' ) );
		}
	}

	/* ---------- Tuỳ chọn ---------- */

	public static function opts() {
		$d = array( 'auto' => 1, 'keep_orientation' => 1, 'keep_icc' => 1 );
		$o = get_option( self::OPT );
		return is_array( $o ) ? array_merge( $d, array_map( 'absint', array_intersect_key( $o, $d ) ) ) : $d;
	}

	public static function sanitize( $in ) {
		$in = is_array( $in ) ? $in : array();
		return array(
			'auto'             => empty( $in['auto'] ) ? 0 : 1,
			'keep_orientation' => empty( $in['keep_orientation'] ) ? 0 : 1,
			'keep_icc'         => empty( $in['keep_icc'] ) ? 0 : 1,
		);
	}

	public static function register_settings() {
		register_setting( 'media', self::OPT, array( 'type' => 'array', 'sanitize_callback' => array( __CLASS__, 'sanitize' ) ) );
		add_settings_section(
			'futa_xna',
			'Xoá nhãn AI khỏi ảnh',
			function () {
				echo '<p id="futa-xna">Gỡ metadata C2PA, IPTC, XMP, EXIF — thứ khiến Facebook/Instagram gắn nhãn “Thông tin về AI” — khỏi ảnh JPG, PNG, WebP, GIF. Ảnh không bị nén lại.</p>';
			},
			'media'
		);
		$fields = array(
			'auto'             => array( 'Khi tải ảnh lên', 'Tự động xoá nhãn AI & metadata' ),
			'keep_orientation' => array( 'Hướng xoay ảnh', 'Giữ lại (để ảnh chụp điện thoại không bị nằm ngang)' ),
			'keep_icc'         => array( 'Hồ sơ màu ICC', 'Giữ lại (để màu hiển thị đúng)' ),
		);
		foreach ( $fields as $key => $f ) {
			add_settings_field(
				'futa_xna_' . $key,
				$f[0],
				array( __CLASS__, 'field_checkbox' ),
				'media',
				'futa_xna',
				array( 'key' => $key, 'label' => $f[1] )
			);
		}
	}

	public static function field_checkbox( $args ) {
		$o = self::opts();
		printf(
			'<label><input type="checkbox" name="%1$s[%2$s]" value="1" %3$s> %4$s</label>',
			esc_attr( self::OPT ),
			esc_attr( $args['key'] ),
			checked( ! empty( $o[ $args['key'] ] ), true, false ),
			esc_html( $args['label'] )
		);
	}

	/* ---------- Xử lý file ---------- */

	/**
	 * Quét (và nếu $write thì xoá) metadata của một file ảnh trên đĩa.
	 *
	 * @return array|null status: cleaned | scanned | unsupported | error
	 */
	public static function clean_file( $path, $o, $write = true ) {
		if ( ! $path || ! is_file( $path ) || ! is_readable( $path ) ) {
			return null;
		}
		$size = filesize( $path );
		if ( ! $size || $size > 200 * MB_IN_BYTES ) {
			return null;
		}
		$b = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( false === $b ) {
			return null;
		}
		$scan = FUTA_AI_Meta::scan( $b );
		$res  = array(
			'status' => 'scanned',
			'ai'     => $scan['ai'],
			'labels' => $scan['ai_labels'],
			'meta'   => $scan['meta_labels'],
			'saved'  => 0,
			'time'   => time(),
		);
		if ( ! FUTA_AI_Meta::can_strip( $scan['format'] ) ) {
			$res['status'] = 'unsupported';
			return $res;
		}
		if ( ! $write ) {
			return $res;
		}
		$out = FUTA_AI_Meta::strip( $b, ! empty( $o['keep_orientation'] ), ! empty( $o['keep_icc'] ) );
		if ( null !== $out && $out !== $b ) {
			if ( ! wp_is_writable( $path ) ) {
				$res['status'] = 'error';
				return $res;
			}
			$w = file_put_contents( $path, $out, LOCK_EX ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			if ( strlen( $out ) !== $w ) {
				file_put_contents( $path, $b, LOCK_EX ); // ghi lỗi giữa chừng → trả lại file gốc
				$res['status'] = 'error';
				return $res;
			}
			clearstatcache( true, $path );
			$res['saved'] = strlen( $b ) - strlen( $out );
		}
		$res['status'] = 'cleaned';
		return $res;
	}

	/** Mọi file của một ảnh: bản gốc trước, rồi bản -scaled/-rotated và các cỡ thu nhỏ. */
	private static function attachment_files( $id, $meta, $include_original = true ) {
		$att   = get_attached_file( $id );
		$orig  = function_exists( 'wp_get_original_image_path' ) ? wp_get_original_image_path( $id ) : '';
		$files = array();
		foreach ( array( $include_original ? $orig : '', $att ) as $f ) {
			if ( $f && file_exists( $f ) && ( $include_original || $f !== $orig ) ) {
				$files[ $f ] = true;
			}
		}
		if ( $att && ! empty( $meta['sizes'] ) && is_array( $meta['sizes'] ) ) {
			foreach ( $meta['sizes'] as $s ) {
				$p = empty( $s['file'] ) ? '' : path_join( dirname( $att ), $s['file'] );
				if ( $p && file_exists( $p ) ) {
					$files[ $p ] = true;
				}
			}
		}
		return array_keys( $files );
	}

	/** Cập nhật dung lượng lưu trong metadata sau khi file nhỏ đi. */
	private static function refresh_filesizes( $id, $meta ) {
		$att = get_attached_file( $id );
		if ( ! is_array( $meta ) || ! $att ) {
			return $meta;
		}
		if ( isset( $meta['filesize'] ) && file_exists( $att ) ) {
			$meta['filesize'] = filesize( $att );
		}
		if ( ! empty( $meta['sizes'] ) && is_array( $meta['sizes'] ) ) {
			foreach ( $meta['sizes'] as $k => $s ) {
				$p = empty( $s['file'] ) ? '' : path_join( dirname( $att ), $s['file'] );
				if ( $p && isset( $s['filesize'] ) && file_exists( $p ) ) {
					$meta['sizes'][ $k ]['filesize'] = filesize( $p );
				}
			}
		}
		return $meta;
	}

	/** Xoá metadata cho mọi file của một ảnh: bản gốc, bản -scaled và các cỡ thu nhỏ. */
	public static function clean_attachment( $id ) {
		$id = absint( $id );
		if ( ! $id || 0 !== strpos( (string) get_post_mime_type( $id ), 'image/' ) ) {
			return null;
		}
		$o    = self::opts();
		$meta = wp_get_attachment_metadata( $id );
		$prev = get_post_meta( $id, self::META, true );
		$agg  = null;
		foreach ( self::attachment_files( $id, $meta ) as $f ) {
			$r = self::clean_file( $f, $o, true );
			if ( ! $r ) {
				continue;
			}
			if ( ! $agg ) {
				$agg = $r; // file đầu tiên = bản gốc → quyết định trạng thái
				continue;
			}
			$agg['ai']     = $agg['ai'] || $r['ai'];
			$agg['labels'] = array_values( array_unique( array_merge( $agg['labels'], $r['labels'] ) ) );
			$agg['meta']   = array_values( array_unique( array_merge( $agg['meta'], $r['meta'] ) ) );
			$agg['saved'] += $r['saved'];
			if ( 'error' === $r['status'] ) {
				$agg['status'] = 'error';
			}
		}
		if ( ! $agg ) {
			return null;
		}
		if ( is_array( $prev ) && ! empty( $prev['ai'] ) ) { // giữ lịch sử “từng có nhãn AI” từ lần xử lý trước
			$agg['ai']     = true;
			$agg['labels'] = array_values( array_unique( array_merge( (array) $prev['labels'], $agg['labels'] ) ) );
		}
		if ( is_array( $meta ) ) {
			wp_update_attachment_metadata( $id, self::refresh_filesizes( $id, $meta ) );
		}
		update_post_meta( $id, self::META, $agg );
		return $agg;
	}

	/* ---------- Tải ảnh lên ---------- */

	public static function on_upload( $upload ) {
		if ( ! is_array( $upload ) || ! empty( $upload['error'] ) || empty( $upload['file'] ) ) {
			return $upload;
		}
		if ( empty( $upload['type'] ) || 0 !== strpos( $upload['type'], 'image/' ) ) {
			return $upload;
		}
		$o = self::opts();
		$r = self::clean_file( $upload['file'], $o, ! empty( $o['auto'] ) );
		if ( $r ) {
			self::$pending[ wp_normalize_path( $upload['file'] ) ] = $r;
		}
		return $upload;
	}

	/** Cỡ thu nhỏ / bản -scaled, -rotated do WordPress tạo (GD ghi thêm chú thích “CREATOR: gd-jpeg…”) → làm sạch luôn. */
	public static function on_generate_metadata( $meta, $id ) {
		$o = self::opts();
		if ( empty( $o['auto'] ) || 0 !== strpos( (string) get_post_mime_type( $id ), 'image/' ) ) {
			return $meta;
		}
		foreach ( self::attachment_files( $id, $meta, false ) as $f ) {
			self::clean_file( $f, $o, true );
		}
		return self::refresh_filesizes( $id, $meta );
	}

	public static function on_add_attachment( $id ) {
		$f = get_attached_file( $id );
		$k = $f ? wp_normalize_path( $f ) : '';
		if ( $k && isset( self::$pending[ $k ] ) ) {
			update_post_meta( $id, self::META, self::$pending[ $k ] );
			unset( self::$pending[ $k ] );
		}
	}

	/* ---------- Hiển thị trạng thái ---------- */

	private static function get_status( $id ) {
		$r = get_post_meta( $id, self::META, true );
		if ( is_array( $r ) && isset( $r['status'] ) ) {
			return $r;
		}
		// Ảnh tải lên trước khi cài plugin: quét (không ghi) rồi lưu lại kết quả
		$path = function_exists( 'wp_get_original_image_path' ) ? wp_get_original_image_path( $id ) : '';
		$path = $path ? $path : get_attached_file( $id );
		$r    = self::clean_file( $path, self::opts(), false );
		if ( $r ) {
			update_post_meta( $id, self::META, $r );
		}
		return $r;
	}

	private static function clean_url( $id ) {
		return wp_nonce_url( admin_url( 'admin-post.php?action=futa_xna_clean&attachment_id=' . absint( $id ) ), 'futa_xna_clean_' . absint( $id ) );
	}

	private static function tool_url() {
		return admin_url( 'upload.php?page=' . self::SLUG );
	}

	public static function status_html( $id ) {
		if ( 0 !== strpos( (string) get_post_mime_type( $id ), 'image/' ) ) {
			return '<span aria-hidden="true">—</span>';
		}
		$r = self::get_status( $id );
		if ( ! $r ) {
			return '<span class="futa-xna meta">Không đọc được file</span>';
		}
		$labels = $r['labels'] ? '<span class="futa-xna-labels">' . esc_html( implode( ', ', array_slice( $r['labels'], 0, 4 ) ) ) . '</span>' : '';
		$fix    = ' <a class="futa-xna-fix" href="' . esc_url( self::clean_url( $id ) ) . '">Xoá ngay</a>';
		switch ( $r['status'] ) {
			case 'cleaned':
				if ( $r['ai'] ) {
					return '<span class="futa-xna ok">🛡 Đã xoá nhãn AI</span>' . $labels;
				}
				return $r['meta'] ? '<span class="futa-xna ok">✓ Đã xoá metadata</span>' : '<span class="futa-xna ok">✓ Sạch</span>';
			case 'scanned':
				if ( $r['ai'] ) {
					return '<span class="futa-xna ai">⚠ Có nhãn AI</span>' . $fix . $labels;
				}
				return $r['meta'] ? '<span class="futa-xna meta">Có metadata</span>' . $fix : '<span class="futa-xna ok">✓ Sạch</span>';
			case 'unsupported':
				return ( $r['ai'] ? '<span class="futa-xna ai">⚠ Có nhãn AI</span>' . $labels : '<span class="futa-xna meta">AVIF/HEIC</span>' )
					. '<span class="futa-xna-labels">Định dạng này cần <a href="' . esc_url( self::tool_url() ) . '">vẽ lại bằng công cụ</a></span>';
			default:
				return '<span class="futa-xna ai">Lỗi ghi file</span>' . $fix;
		}
	}

	public static function add_column( $cols ) {
		$cols['futa_xna'] = 'Nhãn AI';
		return $cols;
	}

	public static function render_column( $col, $id ) {
		if ( 'futa_xna' === $col ) {
			echo self::status_html( $id ); // phpcs:ignore WordPress.Security.EscapeOutput -- đã escape bên trong
		}
	}

	public static function attachment_fields( $fields, $post ) {
		if ( $post && 0 === strpos( (string) $post->post_mime_type, 'image/' ) ) {
			$fields['futa_xna'] = array(
				'label' => 'Nhãn AI',
				'input' => 'html',
				'html'  => '<div class="futa-xna-field">' . self::status_html( $post->ID ) . '</div>',
			);
		}
		return $fields;
	}

	/* ---------- Thao tác ---------- */

	private static function result_args( $results ) {
		$a = array( 'futa_xna_done' => 0, 'futa_xna_ai' => 0, 'futa_xna_saved' => 0, 'futa_xna_skip' => 0 );
		foreach ( $results as $r ) {
			if ( $r && 'cleaned' === $r['status'] ) {
				$a['futa_xna_done']++;
				$a['futa_xna_ai']    += $r['ai'] ? 1 : 0;
				$a['futa_xna_saved'] += $r['saved'];
			} else {
				$a['futa_xna_skip']++;
			}
		}
		return $a;
	}

	public static function handle_single() {
		$id = isset( $_GET['attachment_id'] ) ? absint( $_GET['attachment_id'] ) : 0;
		check_admin_referer( 'futa_xna_clean_' . $id );
		if ( ! $id || ! current_user_can( 'edit_post', $id ) ) {
			wp_die( 'Bạn không có quyền sửa ảnh này.', 403 );
		}
		$r    = self::clean_attachment( $id );
		$back = wp_get_referer();
		$back = $back ? $back : admin_url( 'upload.php' );
		wp_safe_redirect( add_query_arg( self::result_args( array( $r ) ), remove_query_arg( self::QARGS, $back ) ) );
		exit;
	}

	public static function bulk_actions( $actions ) {
		$actions['futa_xna_clean'] = 'Xoá nhãn AI';
		return $actions;
	}

	public static function handle_bulk( $redirect, $action, $ids ) {
		if ( 'futa_xna_clean' !== $action ) {
			return $redirect;
		}
		$res = array();
		foreach ( (array) $ids as $id ) {
			if ( current_user_can( 'edit_post', absint( $id ) ) ) {
				$res[] = self::clean_attachment( $id );
			}
		}
		return add_query_arg( self::result_args( $res ), remove_query_arg( self::QARGS, $redirect ) );
	}

	public static function ajax_batch() {
		check_ajax_referer( 'futa_xna_batch' );
		if ( ! current_user_can( 'upload_files' ) ) {
			wp_send_json_error( 'Bạn không có quyền.', 403 );
		}
		$page = isset( $_POST['page'] ) ? max( 1, absint( $_POST['page'] ) ) : 1;
		$q    = new WP_Query(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'inherit',
				'post_mime_type' => 'image',
				'posts_per_page' => 10,
				'paged'          => $page,
				'orderby'        => 'ID',
				'order'          => 'ASC',
				'fields'         => 'ids',
			)
		);
		$res = array();
		foreach ( $q->posts as $id ) {
			if ( current_user_can( 'edit_post', $id ) ) {
				$res[] = self::clean_attachment( $id );
			}
		}
		$a = self::result_args( $res );
		wp_send_json_success(
			array(
				'page'  => $page,
				'pages' => (int) $q->max_num_pages,
				'total' => (int) $q->found_posts,
				'done'  => $a['futa_xna_done'],
				'ai'    => $a['futa_xna_ai'],
				'saved' => $a['futa_xna_saved'],
				'skip'  => $a['futa_xna_skip'],
			)
		);
	}

	public static function notices() {
		if ( ! isset( $_GET['futa_xna_done'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
			return;
		}
		$n     = absint( $_GET['futa_xna_done'] );
		$ai    = isset( $_GET['futa_xna_ai'] ) ? absint( $_GET['futa_xna_ai'] ) : 0;
		$saved = isset( $_GET['futa_xna_saved'] ) ? absint( $_GET['futa_xna_saved'] ) : 0;
		$skip  = isset( $_GET['futa_xna_skip'] ) ? absint( $_GET['futa_xna_skip'] ) : 0;
		$msg   = sprintf( 'Đã xoá metadata cho %d ảnh (%d ảnh có nhãn AI), giảm %s.', $n, $ai, $saved < KB_IN_BYTES ? $saved . ' B' : size_format( $saved, 1 ) );
		if ( $skip ) {
			$msg .= sprintf( ' Bỏ qua %d ảnh (AVIF/HEIC hoặc không ghi được file).', $skip );
		}
		printf( '<div class="notice notice-success is-dismissible"><p>%s</p></div>', esc_html( $msg ) );
	}

	public static function action_links( $links ) {
		array_unshift(
			$links,
			'<a href="' . esc_url( self::tool_url() ) . '">Công cụ</a>',
			'<a href="' . esc_url( admin_url( 'options-media.php#futa-xna' ) ) . '">Cài đặt</a>'
		);
		return $links;
	}

	/* ---------- Trang Media → Xoá nhãn AI ---------- */

	public static function admin_menu() {
		add_media_page( 'Xoá nhãn AI khỏi ảnh', 'Xoá nhãn AI', 'upload_files', self::SLUG, array( __CLASS__, 'render_page' ) );
	}

	public static function render_page() {
		$o = self::opts();
		?>
		<div class="wrap futa-xna-page">
			<h1>Xoá nhãn AI khỏi ảnh</h1>
			<p>Gỡ metadata C2PA, IPTC, XMP, EXIF và thông số prompt — thứ khiến Facebook, Instagram, Threads gắn nhãn “Thông tin về AI”. Ảnh JPG, PNG, WebP, GIF được giữ nguyên từng điểm ảnh.</p>
			<div class="futa-xna-cards">
				<div class="card">
					<h2>Ảnh đã có trong thư viện</h2>
					<p>Quét và xoá metadata cho toàn bộ ảnh đã tải lên trước đây (bản gốc + các cỡ thu nhỏ). Thao tác ghi đè file trên máy chủ — nên sao lưu trước.</p>
					<p><button type="button" class="button button-primary" id="futa-xna-all">Quét &amp; xoá toàn bộ thư viện</button></p>
					<p id="futa-xna-progress" aria-live="polite"></p>
				</div>
				<div class="card">
					<h2>Khi tải ảnh lên</h2>
					<p>Tự động xoá nhãn AI: <strong><?php echo $o['auto'] ? 'Đang bật' : 'Đang tắt'; ?></strong><br>
					Giữ hướng xoay: <strong><?php echo $o['keep_orientation'] ? 'Có' : 'Không'; ?></strong> · Giữ hồ sơ màu ICC: <strong><?php echo $o['keep_icc'] ? 'Có' : 'Không'; ?></strong></p>
					<p><a class="button" href="<?php echo esc_url( admin_url( 'options-media.php#futa-xna' ) ); ?>">Thay đổi cài đặt</a>
					<a class="button" href="<?php echo esc_url( admin_url( 'upload.php?mode=list' ) ); ?>">Xem cột “Nhãn AI” trong Thư viện</a></p>
				</div>
			</div>
			<h2>Công cụ xử lý ảnh ngay trên trình duyệt</h2>
			<p>Dùng cho ảnh chưa tải lên website, ảnh AVIF/HEIC, hoặc khi cần đổi định dạng. Ảnh không được gửi lên máy chủ.</p>
			<iframe class="futa-xna-frame" title="Công cụ xoá nhãn AI khỏi ảnh" src="<?php echo esc_url( plugins_url( 'tool/index.html', FUTA_XNA_FILE ) ); ?>"></iframe>
		</div>
		<script>
		(function () {
			var btn = document.getElementById('futa-xna-all'), out = document.getElementById('futa-xna-progress');
			var nonce = <?php echo wp_json_encode( wp_create_nonce( 'futa_xna_batch' ) ); ?>;
			function kb(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB'; }
			btn.addEventListener('click', async function () {
				if (!confirm('Xoá metadata AI cho toàn bộ ảnh trong thư viện?\nFile ảnh trên máy chủ sẽ được ghi đè (không nén lại ảnh). Nên sao lưu trước.')) return;
				btn.disabled = true;
				var page = 1, pages = 1, s = { done: 0, ai: 0, saved: 0, skip: 0, total: 0 };
				try {
					do {
						var fd = new FormData();
						fd.append('action', 'futa_xna_batch'); fd.append('_ajax_nonce', nonce); fd.append('page', page);
						var r = await (await fetch(ajaxurl, { method: 'POST', body: fd, credentials: 'same-origin' })).json();
						if (!r.success) throw new Error(r.data || 'Lỗi máy chủ');
						pages = r.data.pages; s.total = r.data.total;
						s.done += r.data.done; s.ai += r.data.ai; s.saved += r.data.saved; s.skip += r.data.skip;
						out.textContent = 'Đã xử lý ' + (s.done + s.skip) + '/' + s.total + ' ảnh · ' + s.ai + ' ảnh có nhãn AI · giảm ' + kb(s.saved);
						page++;
					} while (page <= pages);
					out.textContent += (s.skip ? ' · bỏ qua ' + s.skip + ' ảnh AVIF/HEIC' : '') + ' — hoàn tất ✓';
				} catch (e) {
					out.textContent = 'Lỗi: ' + e.message;
				}
				btn.disabled = false;
			});
		})();
		</script>
		<?php
	}

	public static function admin_css() {
		?>
		<style>
		.futa-xna{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;white-space:nowrap}
		.futa-xna.ok{background:#e2f6e6;color:#146130}.futa-xna.ai{background:#fdecef;color:#c0102e}.futa-xna.meta{background:#fff3d6;color:#8a5a00}
		.futa-xna-labels{display:block;color:#646970;font-size:11px;margin-top:3px;line-height:1.4}
		.futa-xna-fix{font-size:12px;margin-left:4px;white-space:nowrap}
		.fixed .column-futa_xna{width:150px}
		.futa-xna-cards{display:flex;gap:16px;flex-wrap:wrap}.futa-xna-cards .card{max-width:520px;margin-top:0;flex:1 1 320px}
		.futa-xna-frame{width:100%;height:80vh;min-height:640px;border:1px solid #dcdcde;border-radius:8px;background:#f4f6f9}
		</style>
		<?php
	}
}
