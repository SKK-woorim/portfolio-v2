# Hide On Ball (HOB) - GML 구현 코드

아래 코드는 GameMaker Studio 2 기준으로 각 오브젝트와 이벤트에 직접 붙여 넣을 수 있도록 정리한 구현 예시입니다.

## 공통 메모

- `obj_controller`는 `rm_game`에 배치
- `obj_hud`는 `rm_game`에 배치
- `obj_player`는 `rm_game`에 배치
- `rm_main`, `rm_gameover`는 버튼 클릭 처리를 위해 각 룸에 전용 UI 오브젝트를 하나씩 두는 방식으로 구성
- 별도 스프라이트가 없다면 Draw 이벤트에서 단색 도형으로도 동작 가능

---

## [obj_player - Create 이벤트]

```gml
/// @description 플레이어 초기 설정

// 플레이어 이동 관련 상수
move_speed = 8;
touch_half_x = display_get_gui_width() * 0.5;
player_half_width = 24;

// 화면 하단 고정 배치용 값
bottom_margin = 120;

// 시작 위치 보정
x = room_width * 0.5;
y = room_height - bottom_margin;
```

## [obj_player - Step 이벤트]

```gml
/// @description 터치 입력 기반 좌우 이동 처리

// 화면 크기 기준 재계산
touch_half_x = display_get_gui_width() * 0.5;

// 플레이어는 하단 고정
y = room_height - bottom_margin;

// 터치 또는 마우스 입력 시 좌우 이동
if (mouse_check_button(mb_left))
{
    // 터치한 화면 위치가 좌측이면 왼쪽 이동
    if (device_mouse_x_to_gui(0) < touch_half_x)
    {
        x -= move_speed;
    }
    // 우측이면 오른쪽 이동
    else
    {
        x += move_speed;
    }
}

// 스프라이트가 없더라도 정상 동작하도록 폭 계산
var bound_half_width = player_half_width;
if (sprite_index != -1)
{
    bound_half_width = sprite_width * 0.5;
}

// 화면 밖으로 나가지 않도록 제한
x = clamp(x, bound_half_width, room_width - bound_half_width);
```

## [obj_player - Draw 이벤트]

```gml
/// @description 플레이어 기본 그리기

// 스프라이트가 있으면 스프라이트를, 없으면 임시 도형을 그림
if (sprite_index != -1)
{
    draw_self();
}
else
{
    draw_set_color(c_aqua);
    draw_roundrect(x - 24, y - 24, x + 24, y + 24, false);
}
```

---

## [obj_ball - Create 이벤트]

```gml
/// @description 튕기는 공 초기 설정

// 공 이동 관련 상수
base_speed = 6;
max_speed = 15;
ball_radius = 16;

// 컨트롤러가 지정한 속도가 있으면 사용
move_speed = base_speed;
if (variable_instance_exists(id, "spawn_speed"))
{
    move_speed = clamp(spawn_speed, base_speed, max_speed);
}

// 시작 방향은 아래쪽 위주 랜덤
direction = choose(45, 60, 75, 105, 120, 135, 225, 240, 255, 285, 300, 315);
speed = move_speed;
```

## [obj_ball - Step 이벤트]

```gml
/// @description 벽/천장/바닥 반사 처리

// 현재 속도를 최대값 이하로 유지
speed = clamp(speed, 0, max_speed);

// 좌우 벽 반사
if (x <= ball_radius)
{
    x = ball_radius;
    direction = 180 - direction;
}
else if (x >= room_width - ball_radius)
{
    x = room_width - ball_radius;
    direction = 180 - direction;
}

// 천장 반사
if (y <= ball_radius)
{
    y = ball_radius;
    direction = 360 - direction;
}
// 바닥 반사
else if (y >= room_height - ball_radius)
{
    y = room_height - ball_radius;
    direction = 360 - direction;
}
```

## [obj_ball - Collision 이벤트 with obj_player]

```gml
/// @description 플레이어 충돌 시 게임 오버 처리

if (instance_exists(obj_controller))
{
    with (obj_controller)
    {
        game_over = true;
    }
}
```

## [obj_ball - Draw 이벤트]

```gml
/// @description 공 기본 그리기

if (sprite_index != -1)
{
    draw_self();
}
else
{
    draw_set_color(c_red);
    draw_circle(x, y, ball_radius, false);
}
```

---

## [obj_item - Create 이벤트]

```gml
/// @description 아이템 초기 설정

// 낙하 아이템 관련 상수
fall_speed = 3;
item_radius = 18;

// 1~3 사이 숫자 값
value = irandom_range(1, 3);
vspeed = fall_speed;
```

## [obj_item - Step 이벤트]

```gml
/// @description 바닥 도달 시 아이템 제거

if (y > room_height + item_radius)
{
    instance_destroy();
}
```

## [obj_item - Collision 이벤트 with obj_player]

```gml
/// @description 플레이어가 먹으면 생존 시간 보너스 부여

if (instance_exists(obj_controller))
{
    with (obj_controller)
    {
        survive_time += other.value;
        item_bonus_total += other.value;
        score = survive_time + item_bonus_total;
    }
}

instance_destroy();
```

## [obj_item - Draw 이벤트]

```gml
/// @description 아이템 원형 및 숫자 표시

draw_set_color(c_yellow);
draw_circle(x, y, item_radius, false);

draw_set_halign(fa_center);
draw_set_valign(fa_middle);
draw_set_color(c_black);
draw_text(x, y, string(value));
```

---

## [obj_controller - Create 이벤트]

```gml
/// @description 게임 전체 흐름 초기화

// 저장 파일 관련 상수
save_file = "save.ini";
save_section = "score";
save_key_best = "best_score";

// 시간 및 점수 관련 변수
survive_time = 0;
item_bonus_total = 0;
score = 0;
best_score = 0;
final_score = 0;
new_record = false;
game_over = false;

// 난이도 관련 상수
ball_spawn_interval_sec = 10;
item_spawn_interval_steps = room_speed * 3;
speed_up_interval_sec = 30;
spawn_up_interval_sec = 60;
max_ball_count = 5;
base_ball_speed = 6;
max_ball_speed = 15;

// 현재 난이도 상태
current_ball_cap = 1;
current_ball_speed = base_ball_speed;
last_speed_up_stage = 0;
last_spawn_up_stage = 0;

// 최고 기록 불러오기
if (file_exists(save_file))
{
    ini_open(save_file);
    best_score = ini_read_real(save_section, save_key_best, 0);
    ini_close();
}

// 시작 시 공 1개 생성
var spawn_x = irandom_range(40, room_width - 40);
var ball_inst = instance_create_layer(spawn_x, 120, "Instances", obj_ball);
ball_inst.spawn_speed = current_ball_speed;

// 아이템 스폰 알람 시작
alarm[0] = item_spawn_interval_steps;
```

## [obj_controller - Step 이벤트]

```gml
/// @description 시간 증가, 난이도 증가, 게임 오버 처리

// 게임 오버가 아니면 시간 및 난이도 진행
if (!game_over)
{
    // delta_time은 마이크로초이므로 초 단위로 변환
    survive_time += delta_time / 1000000;
    score = survive_time + item_bonus_total;

    // 30초마다 공 속도 증가
    var speed_stage = floor(survive_time / speed_up_interval_sec);
    if (speed_stage > last_speed_up_stage)
    {
        last_speed_up_stage = speed_stage;
        current_ball_speed = min(current_ball_speed + 1, max_ball_speed);

        with (obj_ball)
        {
            speed = min(speed + 1, max_speed);
        }
    }

    // 60초마다 공 최대 동시 수 증가
    var spawn_stage = floor(survive_time / spawn_up_interval_sec);
    if (spawn_stage > last_spawn_up_stage)
    {
        last_spawn_up_stage = spawn_stage;
        current_ball_cap = min(current_ball_cap + 1, max_ball_count);
    }

    // 목표 수보다 공이 적으면 추가 생성
    if (instance_number(obj_ball) < current_ball_cap)
    {
        var need_count = current_ball_cap - instance_number(obj_ball);

        repeat (need_count)
        {
            var spawn_x = irandom_range(40, room_width - 40);
            var ball_inst = instance_create_layer(spawn_x, 120, "Instances", obj_ball);
            ball_inst.spawn_speed = current_ball_speed;
        }
    }
}
else
{
    // 최종 점수 확정
    final_score = score;

    // 최고 기록 갱신 여부 확인
    if (final_score > best_score)
    {
        best_score = final_score;
        new_record = true;

        ini_open(save_file);
        ini_write_real(save_section, save_key_best, best_score);
        ini_close();
    }
    else
    {
        new_record = false;
    }

    // 전역 변수로 결과 전달 후 게임오버 화면 이동
    global.final_score = final_score;
    global.best_score = best_score;
    global.new_record = new_record;

    room_goto(rm_gameover);
}
```

## [obj_controller - Alarm 0 이벤트]

```gml
/// @description 일정 주기마다 아이템 생성

// 게임 중일 때만 아이템 생성
if (!game_over)
{
    var spawn_x = irandom_range(30, room_width - 30);
    instance_create_layer(spawn_x, -20, "Instances", obj_item);

    // 3초 주기로 반복
    alarm[0] = item_spawn_interval_steps;
}
```

---

## [obj_hud - Draw GUI 이벤트]

```gml
/// @description 생존 시간 표시

if (instance_exists(obj_controller))
{
    var time_text = string_format(obj_controller.survive_time, 1, 2) + "s";

    draw_set_halign(fa_center);
    draw_set_valign(fa_top);
    draw_set_color(c_white);
    draw_text(display_get_gui_width() * 0.5, 24, time_text);
}
```

---

## [obj_main_ui - Create 이벤트]

```gml
/// @description 메인 화면 UI 초기화

// 버튼 크기 및 위치 관련 상수
button_w = 240;
button_h = 64;

start_btn_left = room_width * 0.5 - button_w * 0.5;
start_btn_top = room_height * 0.55;
start_btn_right = start_btn_left + button_w;
start_btn_bottom = start_btn_top + button_h;

// 최고 기록 표시용 변수
best_score = 0;
save_file = "save.ini";

if (file_exists(save_file))
{
    ini_open(save_file);
    best_score = ini_read_real("score", "best_score", 0);
    ini_close();
}
```

## [obj_main_ui - Step 이벤트]

```gml
/// @description 게임 시작 버튼 클릭 처리

if (mouse_check_button_pressed(mb_left))
{
    var mx = device_mouse_x_to_gui(0);
    var my = device_mouse_y_to_gui(0);

    if (mx >= start_btn_left && mx <= start_btn_right && my >= start_btn_top && my <= start_btn_bottom)
    {
        room_goto(rm_game);
    }
}
```

## [obj_main_ui - Draw GUI 이벤트]

```gml
/// @description 메인 화면 UI 그리기

draw_set_halign(fa_center);
draw_set_valign(fa_top);
draw_set_color(c_white);
draw_text(display_get_gui_width() * 0.5, 120, "Hide On Ball");
draw_text(display_get_gui_width() * 0.5, 170, "Best : " + string_format(best_score, 1, 2));

draw_set_color(c_lime);
draw_roundrect(start_btn_left, start_btn_top, start_btn_right, start_btn_bottom, false);

draw_set_valign(fa_middle);
draw_set_color(c_black);
draw_text(display_get_gui_width() * 0.5, start_btn_top + button_h * 0.5, "게임 시작");
```

---

## [obj_gameover_ui - Create 이벤트]

```gml
/// @description 게임오버 화면 UI 초기화

// 버튼 크기 및 위치 관련 상수
button_w = 220;
button_h = 56;
button_gap = 20;

retry_left = room_width * 0.5 - button_w * 0.5;
retry_top = room_height * 0.58;
retry_right = retry_left + button_w;
retry_bottom = retry_top + button_h;

main_left = retry_left;
main_top = retry_bottom + button_gap;
main_right = main_left + button_w;
main_bottom = main_top + button_h;

// 글로벌 결과값 가져오기
final_score = 0;
best_score = 0;
new_record = false;

if (variable_global_exists("final_score")) final_score = global.final_score;
if (variable_global_exists("best_score")) best_score = global.best_score;
if (variable_global_exists("new_record")) new_record = global.new_record;
```

## [obj_gameover_ui - Step 이벤트]

```gml
/// @description 다시하기 / 메인으로 버튼 처리

if (mouse_check_button_pressed(mb_left))
{
    var mx = device_mouse_x_to_gui(0);
    var my = device_mouse_y_to_gui(0);

    if (mx >= retry_left && mx <= retry_right && my >= retry_top && my <= retry_bottom)
    {
        room_goto(rm_game);
    }

    if (mx >= main_left && mx <= main_right && my >= main_top && my <= main_bottom)
    {
        room_goto(rm_main);
    }
}
```

## [obj_gameover_ui - Draw GUI 이벤트]

```gml
/// @description 게임오버 UI 그리기

draw_set_halign(fa_center);
draw_set_valign(fa_top);
draw_set_color(c_white);

draw_text(display_get_gui_width() * 0.5, 120, "GAME OVER");
draw_text(display_get_gui_width() * 0.5, 180, "Score : " + string_format(final_score, 1, 2));
draw_text(display_get_gui_width() * 0.5, 220, "Best : " + string_format(best_score, 1, 2));

if (new_record)
{
    draw_set_color(c_yellow);
    draw_text(display_get_gui_width() * 0.5, 270, "NEW RECORD!");
}

draw_set_color(c_lime);
draw_roundrect(retry_left, retry_top, retry_right, retry_bottom, false);
draw_roundrect(main_left, main_top, main_right, main_bottom, false);

draw_set_color(c_black);
draw_set_valign(fa_middle);
draw_text(display_get_gui_width() * 0.5, retry_top + button_h * 0.5, "다시하기");
draw_text(display_get_gui_width() * 0.5, main_top + button_h * 0.5, "메인으로");
```

---

## 룸 배치 가이드

### `rm_main`

- `obj_main_ui` 1개 배치

### `rm_game`

- `obj_controller` 1개 배치
- `obj_hud` 1개 배치
- `obj_player` 1개 배치

### `rm_gameover`

- `obj_gameover_ui` 1개 배치

---

## 보완 권장 사항

- 플레이어와 공의 충돌 정확도를 위해 각 오브젝트에 원형 또는 박스 Collision Mask 설정
- 세로 화면 고정을 위해 Game Options에서 Portrait 설정
- `"Instances"` 레이어 이름이 다르면 `instance_create_layer()`의 레이어명을 실제 룸 레이어명으로 변경
- 스프라이트가 없는 경우 현재 Draw 이벤트만으로 테스트 가능
