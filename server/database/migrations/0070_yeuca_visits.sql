-- 计协官网访问记录：官网挂在 nginx 静态目录上，页面本身不经过 Nuxt，
-- 所以由前台埋点（/api/public/yeuca/track）记页面浏览，公开接口中间件补记接口调用，
-- 两张来源合到一张表，后台「访问记录」按 IP / 路径 / 时间切片看谁在压。
CREATE TABLE `yeuca_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text DEFAULT '' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`is_bot` integer DEFAULT false NOT NULL,
	`bot_name` text DEFAULT '' NOT NULL,
	`action` text DEFAULT 'page_view' NOT NULL,
	`path` text DEFAULT '/' NOT NULL,
	`method` text DEFAULT 'GET' NOT NULL,
	`status` integer,
	`duration_ms` integer,
	`referer` text DEFAULT '' NOT NULL,
	`origin` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `yeuca_visits_created_idx` ON `yeuca_visits` (`created_at`);--> statement-breakpoint
CREATE INDEX `yeuca_visits_ip_created_idx` ON `yeuca_visits` (`ip`, `created_at`);--> statement-breakpoint
CREATE INDEX `yeuca_visits_path_created_idx` ON `yeuca_visits` (`path`, `created_at`);--> statement-breakpoint
CREATE INDEX `yeuca_visits_visitor_created_idx` ON `yeuca_visits` (`visitor_id`, `created_at`);--> statement-breakpoint
CREATE INDEX `yeuca_visits_bot_created_idx` ON `yeuca_visits` (`is_bot`, `created_at`);--> statement-breakpoint
-- 封禁表只放 IP 维度：计协官网没有登录态可封，拦的就是来源地址。
CREATE TABLE `yeuca_ip_bans` (
	`ip` text PRIMARY KEY NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`expires_at` integer,
	`banned_by_admin_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`banned_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `yeuca_ip_bans_active_idx` ON `yeuca_ip_bans` (`is_active`, `expires_at`);
