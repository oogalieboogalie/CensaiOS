-- Breakout, the LÖVE sample for the censaiOS game playground.
-- Arrow keys or A/D (or the mouse) move the paddle, Space launches.
-- Colors come from the board's look through theme.lua when the window
-- provides it, so the game matches every look.

local W, H = 800, 600
local ok, theme = pcall(require, "theme")
if not ok or type(theme) ~= "table" then
  theme = { bg = {0.07, 0.07, 0.08}, ink = {0.93, 0.93, 0.94}, soft = {0.62, 0.63, 0.66}, faint = {0.36, 0.37, 0.4}, accent = {0.36, 0.55, 1.0} }
end

local paddle, ball, bricks, particles
local score, lives, level, state, best = 0, 3, 1, "serve", 0
local mouseX, usingMouse = nil, false
local font, small

local function rgb(c, a) love.graphics.setColor(c[1], c[2], c[3], a or 1) end

local function buildBricks()
  bricks = {}
  local cols, rows = 10, 4 + math.min(level, 4)
  local gap, top = 6, 70
  local bw = (W - 80 - gap * (cols - 1)) / cols
  for r = 1, rows do
    for c = 1, cols do
      local hits = (r <= level - 1) and 2 or 1
      table.insert(bricks, { x = 40 + (c - 1) * (bw + gap), y = top + (r - 1) * (22 + gap), w = bw, h = 22, hits = hits, row = r })
    end
  end
end

local function resetBall()
  ball = { x = paddle.x + paddle.w / 2, y = paddle.y - 9, r = 7, dx = 0, dy = 0, speed = 360 + level * 30 }
  state = "serve"
end

local function launch()
  local angle = math.rad(-90 + love.math.random(-30, 30))
  ball.dx, ball.dy = math.cos(angle) * ball.speed, math.sin(angle) * ball.speed
  state = "play"
end

local function burst(x, y, color)
  for _ = 1, 10 do
    local a = love.math.random() * math.pi * 2
    local s = 60 + love.math.random() * 140
    table.insert(particles, { x = x, y = y, dx = math.cos(a) * s, dy = math.sin(a) * s, life = 0.5, color = color })
  end
end

function love.load()
  love.graphics.setBackgroundColor(theme.bg)
  font = love.graphics.newFont(28)
  small = love.graphics.newFont(14)
  paddle = { x = W / 2 - 55, y = H - 44, w = 110, h = 12, speed = 560 }
  particles = {}
  buildBricks()
  resetBall()
end

local function hitsRect(b, r)
  return b.x + b.r > r.x and b.x - b.r < r.x + r.w and b.y + b.r > r.y and b.y - b.r < r.y + r.h
end

function love.update(dt)
  dt = math.min(dt, 1 / 30)
  local dir = 0
  if love.keyboard.isDown("left", "a") then dir = dir - 1 end
  if love.keyboard.isDown("right", "d") then dir = dir + 1 end
  if dir ~= 0 then usingMouse = false end
  if usingMouse and mouseX then
    paddle.x = paddle.x + (mouseX - paddle.w / 2 - paddle.x) * math.min(1, dt * 18)
  else
    paddle.x = paddle.x + dir * paddle.speed * dt
  end
  paddle.x = math.max(16, math.min(W - 16 - paddle.w, paddle.x))

  for i = #particles, 1, -1 do
    local p = particles[i]
    p.x, p.y, p.life = p.x + p.dx * dt, p.y + p.dy * dt, p.life - dt
    if p.life <= 0 then table.remove(particles, i) end
  end

  if state == "serve" then
    ball.x, ball.y = paddle.x + paddle.w / 2, paddle.y - ball.r - 2
    return
  end
  if state ~= "play" then return end

  ball.x, ball.y = ball.x + ball.dx * dt, ball.y + ball.dy * dt
  if ball.x < 16 + ball.r then ball.x = 16 + ball.r; ball.dx = math.abs(ball.dx) end
  if ball.x > W - 16 - ball.r then ball.x = W - 16 - ball.r; ball.dx = -math.abs(ball.dx) end
  if ball.y < 48 + ball.r then ball.y = 48 + ball.r; ball.dy = math.abs(ball.dy) end

  if ball.dy > 0 and hitsRect(ball, paddle) then
    local offset = ((ball.x - paddle.x) / paddle.w) * 2 - 1
    local angle = math.rad(-90 + offset * 60)
    ball.speed = math.min(ball.speed + 8, 760)
    ball.dx, ball.dy = math.cos(angle) * ball.speed, math.sin(angle) * ball.speed
    ball.y = paddle.y - ball.r
  end

  for i = #bricks, 1, -1 do
    local b = bricks[i]
    if hitsRect(ball, b) then
      local overlapX = math.min(ball.x + ball.r - b.x, b.x + b.w - (ball.x - ball.r))
      local overlapY = math.min(ball.y + ball.r - b.y, b.y + b.h - (ball.y - ball.r))
      if overlapX < overlapY then ball.dx = -ball.dx else ball.dy = -ball.dy end
      b.hits = b.hits - 1
      if b.hits <= 0 then
        table.remove(bricks, i)
        score = score + 10 * level
        burst(b.x + b.w / 2, b.y + b.h / 2, b.row == 1 and theme.accent or theme.soft)
      end
      break
    end
  end

  if #bricks == 0 then
    level = level + 1
    buildBricks()
    resetBall()
  end

  if ball.y > H + 20 then
    lives = lives - 1
    if lives <= 0 then
      best = math.max(best, score)
      state = "over"
    else
      resetBall()
    end
  end
end

function love.draw()
  -- frame
  rgb(theme.faint, 0.6)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle("line", 16.5, 48.5, W - 33, H - 49, 4, 4)

  -- hud
  love.graphics.setFont(small)
  rgb(theme.soft)
  love.graphics.print("Score " .. score, 20, 18)
  love.graphics.printf("Level " .. level, 0, 18, W, "center")
  for i = 1, lives do
    rgb(theme.accent)
    love.graphics.circle("fill", W - 24 - (i - 1) * 16, 26, 4)
  end

  for _, b in ipairs(bricks) do
    if b.row == 1 then rgb(theme.accent) elseif b.hits > 1 then rgb(theme.ink) else rgb(theme.soft, 0.85) end
    love.graphics.rectangle("fill", b.x, b.y, b.w, b.h, 3, 3)
  end

  for _, p in ipairs(particles) do
    rgb(p.color, p.life * 2)
    love.graphics.rectangle("fill", p.x - 2, p.y - 2, 4, 4)
  end

  rgb(theme.ink)
  love.graphics.rectangle("fill", paddle.x, paddle.y, paddle.w, paddle.h, 6, 6)
  rgb(theme.accent)
  love.graphics.circle("fill", ball.x, ball.y, ball.r)

  if state == "serve" then
    love.graphics.setFont(small)
    rgb(theme.soft)
    love.graphics.printf("Space or click to launch", 0, H * 0.62, W, "center")
  elseif state == "over" then
    love.graphics.setFont(font)
    rgb(theme.ink)
    love.graphics.printf("Game over", 0, H * 0.42, W, "center")
    love.graphics.setFont(small)
    rgb(theme.soft)
    love.graphics.printf("Score " .. score .. "   Best " .. best .. "\nSpace to play again", 0, H * 0.42 + 44, W, "center")
  end
end

local function restart()
  score, lives, level = 0, 3, 1
  buildBricks()
  resetBall()
end

function love.keypressed(key)
  if key == "space" or key == "return" then
    if state == "serve" then launch() elseif state == "over" then restart() end
  end
end

function love.mousemoved(x)
  mouseX, usingMouse = x, true
end

function love.mousepressed()
  if state == "serve" then launch() elseif state == "over" then restart() end
end
