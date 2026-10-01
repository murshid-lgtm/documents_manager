<?php
/**
 * Plugin Name: Document Tracking Connector
 * Description: White-label WordPress customer document tracking. Use shortcode [kenza_tracking].
 * Version: 2.6.2
 * Author: Document Operations Platform
 */
if (!defined('ABSPATH')) exit;

define('KENZA_TRACK_VERSION', '2.6.2');
define('KENZA_TRACK_OPTION', 'kenza_tracking_api_base');
define('KENZA_TRACK_ORG_OPTION', 'kenza_tracking_org_slug');
define('KENZA_TRACK_COMPANY_OPTION', 'kenza_tracking_company_name');
define('KENZA_TRACK_TITLE_OPTION', 'kenza_tracking_search_title');
define('KENZA_TRACK_DESCRIPTION_OPTION', 'kenza_tracking_search_description');
define('KENZA_TRACK_HELPER_OPTION', 'kenza_tracking_search_helper');

// This website is bound to one organization in saved connector settings.
// Pretty customer links do not need organization identifiers in their URL.
function kenza_tracking_register_routes() {
    add_rewrite_rule('^track/([A-Za-z0-9._-]+)/?$', 'index.php?pagename=track&kenza_tracking_ref=$matches[1]', 'top');
}
add_action('init', 'kenza_tracking_register_routes');
add_filter('query_vars', function($vars) { $vars[] = 'kenza_tracking_ref'; return $vars; });
add_filter('redirect_canonical', function($redirect) {
    return get_query_var('kenza_tracking_ref') !== '' ? false : $redirect;
});
register_activation_hook(__FILE__, function() { kenza_tracking_register_routes(); flush_rewrite_rules(); update_option('kenza_tracking_routes_version', KENZA_TRACK_VERSION); });
register_deactivation_hook(__FILE__, function() { flush_rewrite_rules(); delete_option('kenza_tracking_routes_version'); });
add_action('admin_init', function() {
    if (current_user_can('manage_options') && get_option('kenza_tracking_routes_version') !== KENZA_TRACK_VERSION) {
        kenza_tracking_register_routes(); flush_rewrite_rules(); update_option('kenza_tracking_routes_version', KENZA_TRACK_VERSION);
    }
});


function kenza_tracking_default_api() {
    return '';
}

function kenza_tracking_api_base() {
    $v = trim((string)get_option(KENZA_TRACK_OPTION, kenza_tracking_default_api()));
    return untrailingslashit($v ?: kenza_tracking_default_api());
}

function kenza_tracking_text_option($name, $default) {
    $value = trim((string)get_option($name, $default));
    return $value !== '' ? $value : $default;
}

add_action('admin_menu', function () {
    add_options_page('Document Tracking', 'Document Tracking', 'manage_options', 'kenza-tracking', 'kenza_tracking_settings_page');
});

add_action('admin_init', function () {
    register_setting('kenza_tracking_settings', KENZA_TRACK_OPTION, [
        'type' => 'string',
        'sanitize_callback' => function($value) {
            $value = esc_url_raw(trim($value));
            return $value ? untrailingslashit($value) : kenza_tracking_default_api();
        },
        'default' => kenza_tracking_default_api(),
    ]);
    register_setting('kenza_tracking_settings', KENZA_TRACK_ORG_OPTION, ['type'=>'string','sanitize_callback'=>'sanitize_title','default'=>'']);
    register_setting('kenza_tracking_settings', KENZA_TRACK_COMPANY_OPTION, ['type'=>'string','sanitize_callback'=>'sanitize_text_field','default'=>'Your Company']);
    register_setting('kenza_tracking_settings', KENZA_TRACK_TITLE_OPTION, ['type'=>'string','sanitize_callback'=>'sanitize_text_field','default'=>'Where are my documents?']);
    register_setting('kenza_tracking_settings', KENZA_TRACK_DESCRIPTION_OPTION, ['type'=>'string','sanitize_callback'=>'sanitize_text_field','default'=>'Enter your tracking number or mobile number to view document progress.']);
    register_setting('kenza_tracking_settings', KENZA_TRACK_HELPER_OPTION, ['type'=>'string','sanitize_callback'=>'sanitize_text_field','default'=>'Use your tracking number or mobile number registered with {company}.']);
});

function kenza_tracking_settings_page() { ?>
    <div class="wrap">
        <h1>Document Tracking Connector</h1>
        <p>Connect this WordPress website to one company in your multi-company tracking platform. Database credentials always stay on the Vercel server.</p>
        <form method="post" action="options.php">
            <?php settings_fields('kenza_tracking_settings'); ?>
            <table class="form-table">
                <tr>
                    <th scope="row"><label for="kenza_tracking_api_base">Tracker Platform URL</label></th>
                    <td>
                        <input id="kenza_tracking_api_base" name="<?php echo esc_attr(KENZA_TRACK_OPTION); ?>"
                               type="url" class="regular-text" value="<?php echo esc_attr(kenza_tracking_api_base()); ?>"
                               placeholder="https://tracker.example.com">
                        <p class="description">Enter the main Vercel/custom tracker domain. Do not add /public-track or /api/public/track.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="kenza_tracking_org_slug">Organization Slug</label></th>
                    <td><input id="kenza_tracking_org_slug" name="<?php echo esc_attr(KENZA_TRACK_ORG_OPTION); ?>" type="text" class="regular-text" value="<?php echo esc_attr(get_option(KENZA_TRACK_ORG_OPTION, '')); ?>" placeholder="kenza"><p class="description"><strong>Required for multi-company tracking.</strong> Copy the company slug from Company Management. For <code>kenza.tracker.example.com</code>, this is normally <code>kenza</code>.</p></td>
                </tr>
                <tr><th scope="row"><label for="kenza_tracking_company_name">Company Name</label></th><td><input id="kenza_tracking_company_name" name="<?php echo esc_attr(KENZA_TRACK_COMPANY_OPTION); ?>" type="text" class="regular-text" value="<?php echo esc_attr(kenza_tracking_text_option(KENZA_TRACK_COMPANY_OPTION, 'Your Company')); ?>"><p class="description">Used in collection messages, help text and printed reports.</p></td></tr>
                <tr><th scope="row"><label for="kenza_tracking_search_title">Search Title</label></th><td><input id="kenza_tracking_search_title" name="<?php echo esc_attr(KENZA_TRACK_TITLE_OPTION); ?>" type="text" class="regular-text" value="<?php echo esc_attr(kenza_tracking_text_option(KENZA_TRACK_TITLE_OPTION, 'Where are my documents?')); ?>"></td></tr>
                <tr><th scope="row"><label for="kenza_tracking_search_description">Search Description</label></th><td><input id="kenza_tracking_search_description" name="<?php echo esc_attr(KENZA_TRACK_DESCRIPTION_OPTION); ?>" type="text" class="large-text" value="<?php echo esc_attr(kenza_tracking_text_option(KENZA_TRACK_DESCRIPTION_OPTION, 'Enter your tracking number or mobile number to view document progress.')); ?>"></td></tr>
                <tr><th scope="row"><label for="kenza_tracking_search_helper">Helper Text</label></th><td><input id="kenza_tracking_search_helper" name="<?php echo esc_attr(KENZA_TRACK_HELPER_OPTION); ?>" type="text" class="large-text" value="<?php echo esc_attr(kenza_tracking_text_option(KENZA_TRACK_HELPER_OPTION, 'Use your tracking number or mobile number registered with {company}.')); ?>"><p class="description">Use <code>{company}</code> where the saved company name should appear.</p></td></tr>
            </table>
            <?php submit_button(); ?>
        </form>
        <hr>
        <h2>Shortcode</h2>
        <code>[kenza_tracking]</code>
        <p>Direct links are supported automatically, for example: <code><?php echo esc_html(home_url('/track/?ref=50474')); ?></code></p>
    </div>
<?php }

add_action('wp_enqueue_scripts', function () {
    wp_register_style('kenza-document-tracking', plugins_url('assets/kenza-tracking-v240.css', __FILE__), [], KENZA_TRACK_VERSION);
    wp_register_script('kenza-document-tracking', plugins_url('assets/kenza-tracking-v240.js', __FILE__), [], KENZA_TRACK_VERSION, true);
});

add_shortcode('kenza_tracking', function ($atts = []) {
    $company = kenza_tracking_text_option(KENZA_TRACK_COMPANY_OPTION, 'Your Company');
    $atts = shortcode_atts([
        'title' => kenza_tracking_text_option(KENZA_TRACK_TITLE_OPTION, 'Where are my documents?'),
        'description' => kenza_tracking_text_option(KENZA_TRACK_DESCRIPTION_OPTION, 'Enter your tracking number or mobile number to view document progress.'),
        'helper' => kenza_tracking_text_option(KENZA_TRACK_HELPER_OPTION, 'Use your tracking number or mobile number registered with {company}.'),
    ], $atts, 'kenza_tracking');
    $helper = str_replace('{company}', $company, $atts['helper']);
    wp_enqueue_style('kenza-document-tracking');
    wp_enqueue_script('kenza-document-tracking');
    wp_localize_script('kenza-document-tracking', 'KenzaTrackingConfig', [
        'ajaxUrl' => admin_url('admin-ajax.php'),
        'nonce' => wp_create_nonce('kenza_tracking_lookup'),
        'title' => sanitize_text_field($atts['title']),
        'companyName' => sanitize_text_field($company),
        'reference' => sanitize_text_field((string)get_query_var('kenza_tracking_ref', '')),
        'trackingPageUrl' => home_url('/track/'),
    ]);

    ob_start(); ?>
    <div class="kenza-wp-tracker kt-v2" data-kenza-tracker>
        <section class="kt-search-panel">
            <div class="kt-search-copy">
                <span class="kt-eyebrow">DOCUMENT TRACKING</span>
                <h2><?php echo esc_html($atts['title']); ?></h2>
                <p><?php echo esc_html($atts['description']); ?></p>
            </div>
            <form class="kt-search" data-kt-form>
                <div class="kt-input-wrap">
                    <span class="kt-search-icon" aria-hidden="true"></span>
                    <input data-kt-input type="text" inputmode="text" autocomplete="off"
                           placeholder="Tracking number or mobile number" aria-label="Tracking number or mobile number">
                </div>
                <button type="submit" class="kt-btn kt-primary" data-kt-submit>Track</button>
            </form>
            <small><?php echo esc_html($helper); ?></small>
        </section>
        <div data-kt-output></div>
    </div>
    <?php return ob_get_clean();
});

function kenza_tracking_ajax_lookup() {
    check_ajax_referer('kenza_tracking_lookup', 'nonce');

    $reference = isset($_POST['reference']) ? sanitize_text_field(wp_unslash($_POST['reference'])) : '';
    $reference = preg_replace('/[^A-Za-z0-9._\/-]/', '', $reference);
    $reference = substr($reference, 0, 50);

    $token = isset($_POST['token']) ? sanitize_text_field(wp_unslash($_POST['token'])) : '';
    if (!preg_match('/^[0-9a-f-]{36}$/i', $token)) $token = '';
    if (!$reference && !$token) {
        wp_send_json_error(['message' => 'Enter a tracking number or mobile number.'], 400);
    }

    $args = ['reference' => $reference];
    if ($token !== '') $args['token'] = $token;
    if (kenza_tracking_api_base() === '') wp_send_json_error(['message'=>'The tracking connector needs its platform URL configured.'],503);
    $org_slug = sanitize_title((string)get_option(KENZA_TRACK_ORG_OPTION, ''));
    if ($org_slug !== '') $args['org'] = $org_slug;
    $url = add_query_arg($args, kenza_tracking_api_base() . '/api/public/track');
    $response = wp_safe_remote_get($url, [
        'timeout' => 15,
        'redirection' => 2,
        'headers' => ['Accept' => 'application/json'],
    ]);

    if (is_wp_error($response)) {
        wp_send_json_error(['message' => 'Tracking service is temporarily unavailable. Please try again.'], 502);
    }

    $status = wp_remote_retrieve_response_code($response);
    $body = json_decode(wp_remote_retrieve_body($response), true);

    if ($status < 200 || $status >= 300 || !is_array($body)) {
        $message = is_array($body) && !empty($body['error']) ? sanitize_text_field($body['error']) : 'Unable to retrieve tracking information.';
        wp_send_json_error(['message' => $message], $status >= 400 && $status < 600 ? $status : 502);
    }

    // Defensive whitelist in WordPress too. Even if the upstream API changes,
    // the shortcode only forwards customer-safe fields.
    $safe_cases = [];
    foreach (($body['cases'] ?? []) as $case) {
        $safe_docs = [];
        foreach (($case['documents'] ?? []) as $doc) {
            $safe_stages = [];
            foreach (($doc['document_stages'] ?? []) as $stage) {
                $safe_stages[] = [
                    'id' => sanitize_text_field((string)($stage['id'] ?? '')),
                    'stage_name' => sanitize_text_field((string)($stage['stage_name'] ?? '')),
                    'stage_order' => intval($stage['stage_order'] ?? 0),
                    'status' => sanitize_text_field((string)($stage['status'] ?? 'Pending')),
                ];
            }
            usort($safe_stages, fn($a,$b) => $a['stage_order'] <=> $b['stage_order']);
            $safe_docs[] = [
                'id' => sanitize_text_field((string)($doc['id'] ?? '')),
                'document_name' => sanitize_text_field((string)($doc['document_name'] ?? 'Document')),
                'occurrence_no' => intval($doc['occurrence_no'] ?? 0),
                'quantity' => intval($doc['quantity'] ?? 0),
                'document_status' => sanitize_text_field((string)($doc['document_status'] ?? '')),
                'document_stages' => $safe_stages,
            ];
        }
        $safe_cases[] = [
            'tracking_reference' => sanitize_text_field((string)($case['tracking_reference'] ?? '')),
            'customer_name' => sanitize_text_field((string)($case['customer_name'] ?? 'Customer')),
            'submission_date' => sanitize_text_field((string)($case['submission_date'] ?? '')),
            'overall_status' => sanitize_text_field((string)($case['overall_status'] ?? 'Received')),
            'documents' => $safe_docs,
        ];
    }

    wp_send_json_success(['cases' => $safe_cases]);
}
add_action('wp_ajax_kenza_tracking_lookup', 'kenza_tracking_ajax_lookup');
add_action('wp_ajax_nopriv_kenza_tracking_lookup', 'kenza_tracking_ajax_lookup');
