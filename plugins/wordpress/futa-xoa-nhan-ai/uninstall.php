<?php
/**
 * Gỡ plugin: xoá cài đặt và trạng thái đã lưu (không đụng tới file ảnh).
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'futa_xna_options' );
delete_post_meta_by_key( '_futa_xna' );
