/* Milestone — polish: privacy (hide amounts) toggle + header elevation. Pure UI, touches no data. */
(function(){
  var r=document.documentElement,K="ms-private";
  try{if(window.MilestoneStorage.get("private")==="1")r.classList.add(K)}catch(e){}
  var hd=document.querySelector(".ms-header"),theme=hd&&hd.querySelector("[data-act=theme]");
  if(theme){
    var b=document.createElement("button");b.type="button";b.className="btn-ghost";b.setAttribute("aria-label","Hide amounts");
    var paint=function(){var on=r.classList.contains(K);b.innerHTML='<i class="cil-low-vision"></i>';b.setAttribute("aria-pressed",on);b.title=on?"Show amounts":"Hide amounts";b.style.opacity=on?1:.7};
    b.onclick=function(){r.classList.toggle(K);window.MilestoneStorage.set("private",r.classList.contains(K)?"1":"0");paint()};
    paint();theme.parentNode.insertBefore(b,theme);
  }
  addEventListener("scroll",function(){if(hd)hd.classList.toggle("is-scrolled",scrollY>4)},{passive:true});
})();

/* Mobile "+" money button: opens a mini menu — + income, − money out */
(function(){
  var fab=document.querySelector("[data-fab]"),dial=document.querySelector(".ms-dial"),bg=document.querySelector(".ms-dialbg");
  if(!fab||!dial)return;
  var icon=fab.querySelector("i");
  function set(open){dial.hidden=bg.hidden=!open;fab.setAttribute("aria-expanded",open);fab.classList.toggle("open",open);icon.className=open?"cil-x":"cil-money"}
  document.addEventListener("click",function(e){
    if(e.target.closest("[data-fab]")){set(dial.hidden);return}
    if(!dial.hidden)set(false); /* any other tap (menu items, backdrop) closes it; menu items still fire their own data-act */
  });
  document.addEventListener("keydown",function(e){if(e.key==="Escape")set(false)});
  addEventListener("hashchange",function(){set(false)});
})();

/* Auto-collapse the sidebar on tablets / small or scaled desktop windows (768–1099px) so content gets the room.
   Your own Collapse choice still applies on larger screens. */
(function(){
  var r=document.documentElement,mq=matchMedia("(min-width:768px) and (max-width:1099.98px)");
  function pref(){return window.MilestoneStorage.get("collapsed")==="1"}
  function sync(){
    r.classList.toggle("ms-collapsed",mq.matches||pref());
    var b=document.querySelector("[data-act=collapse]");if(b)b.title=r.classList.contains("ms-collapsed")?"Expand sidebar":"Collapse sidebar";
    setTimeout(function(){try{dispatchEvent(new Event("resize"))}catch(e){}},230);
  }
  if(mq.addEventListener)mq.addEventListener("change",sync);else mq.addListener(sync);
  sync();
})();

/* Browser / phone status-bar colour follows the theme (the page used to say dark navy even in light mode). */
(function(){
  var r=document.documentElement,m=document.querySelector("meta[name=theme-color]");
  if(!m||!window.MutationObserver)return;
  function sync(){m.setAttribute("content",r.getAttribute("data-coreui-theme")==="light"?"#f4f5fb":"#050816")}
  new MutationObserver(sync).observe(r,{attributes:true,attributeFilter:["data-coreui-theme"]});
  sync();
})();
