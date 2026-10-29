create table if not exists categories (
    id integer primary key,
    name text not null unique collate nocase check (length(trim(name)) between 1 and 60)
);

create table if not exists recipes (
    id text primary key,
    name text not null check (length(trim(name)) between 1 and 120),
    rating integer check (rating between 1 and 5),
    notes text not null default '',
    category_id integer references categories (id) on delete set null,
    created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists recipes_created_at_idx
    on recipes (created_at desc);

create table if not exists recipe_steps (
    recipe_id text not null references recipes (id) on delete cascade,
    position integer not null check (position >= 0),
    content text not null check (length(trim(content)) > 0),
    primary key (recipe_id, position)
);

create table if not exists recipe_ingredients (
    recipe_id text not null references recipes (id) on delete cascade,
    position integer not null check (position >= 0),
    content text not null check (length(trim(content)) > 0),
    primary key (recipe_id, position)
);

create table if not exists recipe_images (
    id text primary key,
    recipe_id text not null references recipes (id) on delete cascade,
    position integer not null check (position >= 0),
    file_name text not null unique,
    content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
    unique (recipe_id, position)
);
