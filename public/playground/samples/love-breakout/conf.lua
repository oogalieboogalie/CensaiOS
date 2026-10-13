function love.conf(t)
  t.identity = "censai-breakout"
  t.window.title = "Breakout"
  t.window.width = 800
  t.window.height = 600
  t.window.vsync = 1
  t.modules.joystick = false
  t.modules.physics = false
end
