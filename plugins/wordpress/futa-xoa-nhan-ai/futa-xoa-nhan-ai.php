<?php
/**
 * Plugin Name:       FUTA Land — Xoá nhãn AI khỏi ảnh
 * Description:       Tự động gỡ metadata C2PA, IPTC, XMP, EXIF (thứ khiến Facebook/Instagram gắn nhãn “Thông tin về AI”) khỏi ảnh khi tải lên Thư viện — không nén lại ảnh. Kèm cột trạng thái, xử lý hàng loạt và công cụ xoá nhãn AI ngay trong trang quản trị.
 * Version:           1.1.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            FUTA Land
 * License:           GPL-2.0-or-later
 * Text Domain:       futa-xoa-nhan-ai
 */

defined( 'ABSPATH' ) || exit;

define( 'FUTA_XNA_VERSION', '1.1.0' );
define( 'FUTA_XNA_FILE', __FILE__ );

require_once __DIR__ . '/includes/class-futa-ai-meta.php';
require_once __DIR__ . '/includes/class-futa-xna-plugin.php';

FUTA_XNA_Plugin::init();
