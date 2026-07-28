// Floating music player
(function() {
  var btn = document.createElement('button');
  btn.id = 'musicTgl';
  btn.innerHTML = '🎵';
  btn.title = '音乐播放器';
  btn.style.cssText = 'position:fixed;bottom:20px;left:20px;width:44px;height:44px;border-radius:50%;background:var(--primary);color:#fff;border:none;font-size:18px;cursor:pointer;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,0.25);transition:transform 0.2s;';
  btn.onmouseenter = function() { this.style.transform = 'scale(1.1)'; };
  btn.onmouseleave = function() { this.style.transform = 'scale(1)'; };
  
  var player = document.createElement('div');
  player.id = 'musicPlayer';
  player.style.cssText = 'display:none;position:fixed;bottom:72px;left:20px;z-index:999;background:var(--bg-alt);border:1px solid var(--border);border-radius:12px;padding:8px;box-shadow:0 8px 32px rgba(0,0,0,0.2);';
  player.innerHTML = '<iframe frameborder="no" border="0" marginwidth="0" marginheight="0" width="280" height="86" src="https://music.163.com/outchain/player?type=2&id=552649225&auto=0&height=66"></iframe>';

  btn.onclick = function() {
    var v = player.style.display === 'none' ? 'block' : 'none';
    player.style.display = v;
    btn.innerHTML = v === 'block' ? '✕' : '🎵';
  };
  
  document.body.appendChild(btn);
  document.body.appendChild(player);
})();
