/* =====================================================================
   SDA APP — router, sidebar, command palette, page renderers, home, boot
   ===================================================================== */
(function () {
  "use strict";
  const SDA = window.SDA;
  const { $, $$, el, esc, clamp, fmtNum } = SDA.u;
  const ui = SDA.ui;
  const Store = SDA.store;

  /* ---------------- learning paths ---------------- */
  SDA.paths = [
    {
      id: "beginner",
      icon: "🌱",
      title: "Beginner 0 → 1",
      blurb:
        "Never designed a system? Learn how a request travels, how to estimate load and how to scale your first app.",
      items: [
        "m:foundations",
        "m:networking",
        "m:traffic",
        "m:caching",
        "case:url-shortener",
        "case:pastebin",
      ],
    },
    {
      id: "intermediate",
      icon: "🧱",
      title: "Intermediate",
      blurb:
        "Databases, consistency, queues and search — the building blocks behind every serious backend.",
      items: [
        "m:databases",
        "m:distributed",
        "m:async",
        "m:search",
        "m:principles",
        "case:rate-limiter",
        "case:notification-service",
        "case:typeahead",
      ],
    },
    {
      id: "advanced",
      icon: "🚀",
      title: "Advanced",
      blurb:
        "Reliability, platforms, observability, security and real-time media at planet scale.",
      items: [
        "m:reliability",
        "m:architecture",
        "m:observability",
        "m:security",
        "m:realtime",
        "case:kv-store",
        "case:web-crawler",
      ],
    },
    {
      id: "interview",
      icon: "🎯",
      title: "Interview Sprint",
      blurb:
        "Framework, estimation drills, trade-off vocabulary and full worked solutions. Built for the next 2–4 weeks.",
      items: [
        "l:seven-step-approach",
        "l:back-of-envelope",
        "pg:envelope",
        "m:interview",
        "page:interview-solutions",
        "page:practice",
      ],
    },
    {
      id: "cases",
      icon: "🏗️",
      title: "Build-by-Case-Study",
      blurb:
        "Watch real products evolve from one server to planet scale, then build a weekend version yourself.",
      items: [
        "case:url-shortener",
        "case:whatsapp",
        "case:youtube",
        "case:uber",
        "case:zomato",
        "case:upi",
        "case:irctc",
        "case:netflix",
        "case:google-search",
        "case:feed",
        "case:amazon",
      ],
    },
  ];
  const KIND_NAME = {
    m: "Module",
    l: "Lesson",
    pg: "Playground",
    lab: "Code lab",
    page: "Page",
    case: "Case study",
  };

  function modProgress(m) {
    const total = m.lessons.length;
    const done = m.lessons.filter((l) => Store.isDone(l.id)).length;
    return { done, total, pct: total ? Math.round((done * 100) / total) : 0 };
  }
  function overall() {
    let total = 0,
      done = 0;
    for (const id of SDA.lessons.keys()) {
      total++;
      if (Store.isDone(id)) done++;
    }
    return { done, total, pct: total ? Math.round((done * 100) / total) : 0 };
  }
  SDA.modProgress = modProgress;
  SDA.resolve = function (ref) {
    const i = ref.indexOf(":");
    const k = ref.slice(0, i),
      id = ref.slice(i + 1);
    try {
      if (k === "m") {
        const m = SDA.modById.get(id);
        return (
          m && {
            icon: m.icon || "📦",
            title: m.title,
            sub: `Module · ${m.lessons.length} lessons`,
            href: "#/m/" + id,
            pct: modProgress(m).pct,
          }
        );
      }
      if (k === "l") {
        const l = SDA.lessons.get(id);
        return (
          l && {
            icon: "📘",
            title: l.title,
            sub: "Lesson · " + (SDA.modById.get(l.module) || {}).title,
            href: "#/l/" + id,
            pct: Store.isDone(id) ? 100 : 0,
          }
        );
      }
      if (k === "pg") {
        const p = SDA.playgrounds.get(id);
        return (
          p && {
            icon: p.icon || "🧪",
            title: p.title,
            sub: "Playground",
            href: "#/pg/" + id,
          }
        );
      }
      if (k === "lab") {
        const p = SDA.labs.get(id);
        return (
          p && {
            icon: "🧪",
            title: p.title,
            sub: "Code lab",
            href: "#/lab/" + id,
          }
        );
      }
      if (k === "page") {
        const p = SDA.pages.get(id);
        return (
          p && {
            icon: p.icon || "📄",
            title: p.title,
            sub: p.summary || "Page",
            href: "#/page/" + id,
          }
        );
      }
      const r = SDA.resolvers[k];
      return r ? r(id) : null;
    } catch (e) {
      return null;
    }
  };

  /* ---------------- router ---------------- */
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, "");
    const parts = raw
      .split("?")[0]
      .split("/")
      .filter(Boolean)
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch (e) {
          return s;
        }
      });
    return { name: parts[0] || "", args: parts.slice(1) };
  }
  SDA.parseHash = parseHash;
  let navCount = 0;
  function render() {
    SDA.disposeAll();
    hideTip();
    const { name, args } = parseHash();
    const view = $("#view");
    view.innerHTML = "";
    const page = el("div", { class: "page" });
    const content = el("article", { class: "content" });
    const toc = el("aside", { class: "toc", "aria-label": "On this page" });
    page.append(content, toc);
    view.append(page);
    const ctx = {
      name,
      args,
      page,
      content,
      toc,
      useToc: false,
      wide: false,
      title: "",
      track: null,
      base: "#/" + name + (args[0] ? "/" + encodeURIComponent(args[0]) : ""),
      scrollTo: null,
    };
    const handler = SDA.routes[name] || notFound;
    try {
      handler(ctx);
    } catch (e) {
      console.error(e);
      content.innerHTML = "";
      content.append(SDA.errCard("This page failed to render", e));
    }
    if (ctx.wide) page.classList.add("wide");
    if (ctx.useToc) buildToc(ctx);
    else toc.remove();
    document.title =
      (ctx.title ? ctx.title + " · " : "") + "System Design Playbook";
    $$(".prose", content).forEach((p) => {
      try {
        SDA.glossify(p);
      } catch (e) {
        console.error(e);
      }
    });
    SDA.revealScan(view);
    renderSidebar();
    updateRing();
    if (ctx.track) {
      Store.data.last = Object.assign({}, ctx.track, {
        href: location.hash || "#/",
      });
      Store.save();
    }
    view.classList.remove("view-enter");
    void view.offsetWidth;
    if (!SDA.reduced) view.classList.add("view-enter");
    closeNav();
    const target = ctx.scrollTo && document.getElementById(ctx.scrollTo);
    if (target) {
      requestAnimationFrame(() => {
        target.classList.add("in");
        target.scrollIntoView({ block: "start" });
        if (ctx.flash) {
          target.classList.add("flash");
        }
      });
    } else window.scrollTo(0, 0);
    if (navCount++ > 0) $("#main").focus({ preventScroll: true });
  }
  SDA.render = render;
  function buildToc(ctx) {
    const hs = $$("[data-toc]", ctx.content);
    if (hs.length < 2) {
      ctx.toc.remove();
      return;
    }
    ctx.page.classList.add("has-toc");
    ctx.toc.append(el("h4", null, "On this page"));
    const links = hs.map((hd) => {
      const a = el(
        "a",
        {
          href: ctx.base + "/" + hd.id,
        },
        hd.dataset.toc,
      );
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (hd.dataset.deep) {
          const control = ctx.content.querySelector(`[aria-controls="${hd.id}"]`);
          if (control?.getAttribute("aria-expanded") === "false") control.click();
        }
        hd.classList.add("in");
        hd.scrollIntoView({
          behavior: SDA.reduced ? "auto" : "smooth",
          block: "start",
        });
        history.replaceState(null, "", ctx.base + "/" + hd.id);
      });
      ctx.toc.append(a);
      return a;
    });
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      () => {
        let cur = 0;
        hs.forEach((hd, i) => {
          if (hd.offsetParent !== null && hd.getBoundingClientRect().top < 160)
            cur = i;
        });
        links.forEach((a, i) => a.classList.toggle("active", i === cur));
      },
      { rootMargin: "-70px 0px -55% 0px", threshold: [0, 1] },
    );
    hs.forEach((hd) => io.observe(hd));
    SDA.onDispose(() => io.disconnect());
  }
  function notFound(ctx) {
    ctx.title = "Not found";
    ctx.content.append(
      el(
        "div",
        { class: "empty", style: { marginTop: "40px" } },
        el("div", { style: { fontSize: "48px" } }, "🧭"),
        el("h1", { class: "page-title" }, "Page not found"),
        el(
          "p",
          { class: "muted" },
          "That link points to content that does not exist (yet). Try search or head home.",
        ),
        el(
          "div",
          { class: "row", style: { justifyContent: "center" } },
          el("a", { class: "btn primary", href: "#/" }, "Go home"),
          ui.button("Search (Ctrl K)", openPalette, ""),
        ),
      ),
    );
  }

  /* ---------------- shared bits for pages ---------------- */
  function crumbs(list) {
    return el("nav", {
      class: "crumbs",
      "aria-label": "Breadcrumb",
      html: list
        .map(([href, t]) =>
          href
            ? `<a href="${href}">${esc(t)}</a>`
            : `<span aria-current="page">${esc(t)}</span>`,
        )
        .join('<span aria-hidden="true">/</span>'),
    });
  }
  function doneCheck(id) {
    const inp = el("input", {
      type: "checkbox",
      "aria-label": "Mark lesson complete",
    });
    inp.checked = Store.isDone(id);
    inp.addEventListener("change", () => {
      Store.setDone(id, inp.checked);
      if (inp.checked) SDA.toast("✅ Lesson marked complete");
    });
    return el("label", { class: "check" }, inp, "Mark complete");
  }
  function api(host) {
    return {
      onDispose: SDA.onDispose,
      loop: (fn) => SDA.loop(host, fn),
      reduced: SDA.reduced,
      ui: SDA.ui,
      h: SDA.h,
      u: SDA.u,
      Diagram: SDA.Diagram,
      host,
    };
  }
  SDA.api = api;
  function logoText(co) {
    return String(co)
      .replace(/[()]/g, "")
      .split(/[\s/&+-]+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  function realEl(list) {
    if (typeof list === "string") return el("div", { html: list });
    const box = el("div", { class: "real" });
    list.forEach((r) =>
      box.append(
        el(
          "div",
          { class: "card rw" },
          el(
            "div",
            { class: "logo", "aria-hidden": "true" },
            r.logo || logoText(r.co),
          ),
          el(
            "div",
            null,
            el("h4", {
              html: `${esc(r.co)} ${SDA.h.tier(r.tier || "confirmed")}`,
            }),
            el("p", { html: r.text }),
            r.src
              ? el("div", { class: "src", html: "Source: " + r.src })
              : null,
          ),
        ),
      ),
    );
    return box;
  }
  SDA.realEl = realEl;
  function tradeoffsEl(t) {
    const col = (cls, icon, title, items) =>
      items && items.length
        ? el(
            "div",
            { class: "to " + cls },
            el("h4", null, icon + " " + title),
            el("ul", { html: items.map((x) => `<li>${x}</li>`).join("") }),
          )
        : null;
    return el(
      "div",
      { class: "tradeoffs" },
      col("use", "✔", "Good fit", t.use),
      col("avoid", "✘", "Poor fit", t.avoid),
      col("alt", "⇄", "Other options", t.alt),
    );
  }
  SDA.tradeoffsEl = tradeoffsEl;
  function mountPg(b, id, compact) {
    const p = SDA.playgrounds.get(id);
    if (!p) {
      b.append(
        el(
          "div",
          { class: "empty" },
          `Playground "${id}" is not installed yet.`,
        ),
      );
      return;
    }
    const host = el("div", { class: "panel-b pg-host" });
    const panel = el(
      "div",
      { class: "panel", style: { margin: "16px 0" } },
      el(
        "div",
        { class: "panel-h" },
        el("span", { "aria-hidden": "true" }, p.icon || "🧪"),
        el("h3", null, p.title),
        compact
          ? el(
              "a",
              {
                href: "#/pg/" + p.id,
                class: "btn sm ghost",
                style: { marginLeft: "auto" },
              },
              "Open full page ↗",
            )
          : null,
      ),
      host,
    );
    b.append(panel);
    try {
      p.mount(host, Object.assign(api(host), { compact: !!compact }));
    } catch (e) {
      console.error(e);
      host.append(SDA.errCard("Playground failed to start", e));
    }
  }
  SDA.mountPg = mountPg;
  // Reader-facing wording for headings written inside lesson HTML. The lesson data keeps the old
  // headings because lesson-check requires some of them. This only changes what the page shows.
  const PLAIN_HEADINGS = [
    [/<h3>\s*A small example\s*<\/h3>/i, ""],
    [/<h3>\s*What happens behind the scenes\s*<\/h3>/i, ""],
    [/<h3>\s*Everyday comparison\s*<\/h3>/i, "<h3>Think of it like this</h3>"],
    [/<h3>\s*How we handle it\s*<\/h3>/i, "<h3>What we do about it</h3>"],
    [/<h3>\s*When to use which\s*<\/h3>/i, "<h3>Which one to pick</h3>"],
    [/Important point<\/b>/g, "Remember this</b>"],
  ];
  const plain = (html) => PLAIN_HEADINGS.reduce((h, [rx, to]) => h.replace(rx, to), String(html || ""));
  function renderTry(b, t) {
    (Array.isArray(t) ? t : [t]).forEach((x) => {
      if (x.note) b.insertAdjacentHTML("beforeend", `<p>${x.note}</p>`);
      if (x.pg) mountPg(b, x.pg, true);
      if (x.lab) {
        const lab = SDA.labs.get(x.lab);
        if (lab) ui.lab(b, lab);
      }
      if (x.quiz) ui.quiz(b, x.quiz, { id: x.quizId });
      if (x.mount) {
        const host = el("div", {
          class: "pg-host panel",
          style: { padding: "16px", margin: "16px 0" },
        });
        b.append(host);
        x.mount(host, api(host));
      }
      if (x.html) b.insertAdjacentHTML("beforeend", x.html);
    });
  }
  function renderHow(b, how) {
    if (how.intro) b.insertAdjacentHTML("beforeend", `<p>${plain(how.intro)}</p>`);
    if (how.steps) {
      const pictured = how.steps.length && how.steps.every((s) => s && typeof s === "object");
      b.insertAdjacentHTML(
        "beforeend",
        pictured
          ? '<ol class="picture-steps">' +
              how.steps.map((s) => `<li><span class="picture-steps-icon" aria-hidden="true">${esc(s.icon)}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></li>`).join("") +
              "</ol>"
          : '<ol class="steps">' +
              how.steps.map((s) => `<li>${s}</li>`).join("") +
              "</ol>",
      );
    }
    if (how.diagram) new SDA.Diagram(b, how.diagram);
    if (how.stepper) ui.stepper(b, how.stepper);
    if (how.mount) {
      const host = el("div", { class: "pg-host" });
      b.append(host);
      how.mount(host, api(host));
    }
    if (how.html) b.insertAdjacentHTML("beforeend", plain(how.html));
  }

  /* ---------------- LESSON ---------------- */
  SDA.routes.l = function (ctx) {
    const [id, sec] = ctx.args;
    const l = SDA.lessons.get(id);
    if (!l) return notFound(ctx);
    const m = SDA.modById.get(l.module);
    const c = ctx.content;
    const lv = SDA.LEVELS.find((x) => x.id === m.level) || {};
    ctx.title = l.title;
    ctx.useToc = true;
    ctx.scrollTo = sec;
    ctx.track = { kind: "Lesson", title: l.title, icon: m.icon || "📘" };
    c.append(
      crumbs([
        ["#/", "Home"],
        ["#/m/" + m.id, m.title],
        [null, "Lesson " + (l.index + 1)],
      ]),
    );
    c.append(el("h1", { class: "page-title" }, l.title));
    if (l.summary) c.append(el("p", { class: "lead", html: "<strong>In one line.</strong> " + l.summary }));
    c.append(
      el(
        "div",
        { class: "row" },
        el("span", { class: "chip lvl" }, `${lv.icon || ""} ${lv.name || ""}`),
        el("span", { class: "chip" }, `⏱ ${l.minutes || 8} min`),
        el(
          "a",
          { class: "chip", href: "#/m/" + m.id },
          `${m.icon || ""} ${m.title}`,
        ),
      ),
    );
    const lessonHead = el("div", { class: "lesson-head" }, doneCheck(l.id));
    c.append(lessonHead);
    let n = 0;
    const hasDeep = !!(l.deep || (l.how && l.how.deep));
    const sec_ = (key, title, build, sub) => {
      const s = el("section", {
        class: "sec reveal",
        id: key,
        "data-toc": title,
      });
      s.append(
        el(
          "div",
          { class: "sec-h" },
          el(
            "span",
            { class: "sec-n", "aria-hidden": "true" },
            String(++n),
          ),
          sub
            ? el("div", { class: "sec-t" }, el("h2", null, title), el("p", { class: "sec-sub" }, sub))
            : el("h2", null, title),
        ),
      );
      const body = el("div", { class: "prose" });
      s.append(body);
      try {
        build(body);
      } catch (e) {
        console.error(e);
        body.append(SDA.errCard("This section failed to render", e));
      }
      c.append(s);
    };
    if (l.problem)
      sec_("problem", "A small example", (b) => (b.innerHTML = plain(l.problem)),
        "One real situation, so the idea has something to hold on to.");
    if (l.intuition)
      sec_(
        "intuition",
        "The everyday picture",
        (b) => (b.innerHTML = `<blockquote>💡 ${l.intuition}</blockquote>`),
        "The same idea, in daily life.",
      );
    if (l.how) sec_("how", "Step by step: follow one example", (b) => renderHow(b, l.how),
      "See what happens at each step, from start to finish.");
    if (hasDeep) {
      const host = c.querySelector("#how .prose") ||
        c.querySelector("#intuition .prose") ||
        c.querySelector("#problem .prose") || c;
      const button = el("button", {
        type: "button",
        class: "btn primary depth-disclosure",
        "aria-expanded": "false",
        "aria-controls": "deep",
      }, "Go deeper");
      // Name what is inside, so the reader knows if it is worth opening.
      const deepHtml = (l.how?.deep || "") + (l.deep || "");
      const topics = [...deepHtml.matchAll(/<b>([^<]{3,40})<\/b>/g)].map((m) => m[1].replace(/[.:]$/, "")).slice(0, 3);
      const goLabel = topics.length ? "Go deeper: " + topics.join(", ") : "Go deeper";
      button.textContent = goLabel;
      const region = el("section", {
        id: "deep",
        class: "callout deep depth-content",
        hidden: true,
        tabindex: "-1",
        "data-toc": "Go deeper",
        "data-deep": "1",
      }, el("h3", null, "Go deeper"));
      if (l.how?.deep) region.insertAdjacentHTML("beforeend", l.how.deep);
      if (l.deep) region.insertAdjacentHTML("beforeend", l.deep);
      button.addEventListener("click", () => {
        const open = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(open));
        button.textContent = open ? "Hide deep dive" : goLabel;
        region.hidden = !open;
        if (open) {
          region.classList.add("in");
          region.scrollIntoView({
            behavior: SDA.reduced ? "auto" : "smooth",
            block: "start",
          });
          region.focus({ preventScroll: true });
        }
      });
      host.append(button, region);
      if (sec === "deep") button.click();
    }
    if (l.tradeoffs)
      sec_("tradeoffs", "When to use it, and when not to", (b) =>
        b.append(tradeoffsEl(l.tradeoffs)),
        "A quick way to decide if this fits your case.",
      );
    if (l.real)
      sec_("real", "Who uses this in real life", (b) => b.append(realEl(l.real)),
        "Real companies, and what they chose.");
    if (l.mistakes || l.interview)
      sec_("mistakes", "Common mistakes, and what interviewers ask", (b) =>
        b.append(
          el(
            "div",
            { class: "mi" },
            l.mistakes
              ? el(
                  "div",
                  { class: "card" },
                  el("h4", null, "⚠️ Common mistakes"),
                  el("ul", {
                    html: l.mistakes.map((x) => `<li>${x}</li>`).join(""),
                  }),
                )
              : null,
            l.interview
              ? el(
                  "div",
                  { class: "card" },
                  el("h4", null, "🎤 Interview angle"),
                  el("ul", {
                    html: l.interview.map((x) => `<li>${x}</li>`).join(""),
                  }),
                )
              : null,
          ),
        ),
        "What goes wrong in practice, and how to answer in an interview.",
      );
    if (l.tryit) sec_("tryit", "Try it yourself", (b) => renderTry(b, l.tryit),
      "Play with it, and see the idea work.");
    if (l.sources)
      c.append(
        el(
          "section",
          { class: "sec" },
          el(
            "h3",
            {
              style: {
                fontSize: "14px",
                textTransform: "uppercase",
                letterSpacing: ".08em",
                color: "var(--faint)",
              },
            },
            "Where to read more",
          ),
          el("ul", {
            class: "prose",
            style: { fontSize: "14px" },
            html: l.sources.map((s) => `<li>${s}</li>`).join(""),
          }),
        ),
      );
    const prev = m.lessons[l.index - 1],
      next = m.lessons[l.index + 1];
    c.append(
      el(
        "div",
        {
          class: "card",
          style: {
            marginTop: "40px",
            display: "flex",
            gap: "14px",
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "space-between",
          },
        },
        el(
          "div",
          null,
          el("b", null, "Finished this lesson?"),
          el(
            "div",
            { class: "muted", style: { fontSize: "14px" } },
            "Mark it complete to track your roadmap progress.",
          ),
        ),
        ui.button(
          next ? "✓ Complete &amp; next →" : "✓ Complete &amp; take the quiz",
          () => {
            Store.setDone(l.id, true);
            location.hash = next ? "#/l/" + next.id : "#/m/" + m.id + "/quiz";
          },
          "primary magnetic",
        ),
      ),
    );
    const pn = el("nav", { class: "pn", "aria-label": "Lesson navigation" });
    if (prev)
      pn.append(
        el(
          "a",
          { href: "#/l/" + prev.id },
          el("small", null, "← Previous"),
          prev.title,
        ),
      );
    if (next)
      pn.append(
        el(
          "a",
          { href: "#/l/" + next.id, class: "next" },
          el("small", null, "Next →"),
          next.title,
        ),
      );
    else
      pn.append(
        el(
          "a",
          { href: "#/m/" + m.id + "/quiz", class: "next" },
          el("small", null, "Next →"),
          "Module quiz & cheat sheet",
        ),
      );
    c.append(pn);
  };

  /* ---------------- MODULE ---------------- */
  SDA.routes.m = function (ctx) {
    const [id, tab] = ctx.args;
    const m = SDA.modById.get(id);
    if (!m) return notFound(ctx);
    const c = ctx.content;
    const lv = SDA.LEVELS.find((x) => x.id === m.level) || {};
    const pr = modProgress(m);
    ctx.title = m.title;
    ctx.track = { kind: "Module", title: m.title, icon: m.icon || "📦" };
    const mins = m.lessons.reduce((s, l) => s + (l.minutes || 8), 0);
    c.append(
      crumbs([
        ["#/", "Home"],
        ["#/roadmap", "Roadmap"],
        [null, m.title],
      ]),
    );
    c.append(
      el(
        "div",
        { class: "row", style: { marginTop: "12px" } },
        el("span", { class: "chip lvl" }, `${lv.icon || ""} ${lv.name || ""}`),
        el("span", { class: "chip" }, `${m.lessons.length} lessons`),
        el("span", { class: "chip" }, `⏱ ~${Math.round(mins / 5) * 5} min`),
      ),
    );
    c.append(el("h1", { class: "page-title" }, `${m.icon || ""} ${m.title}`));
    if (m.summary) c.append(el("p", { class: "lead", html: m.summary }));
    const firstOpen =
      m.lessons.find((l) => !Store.isDone(l.id)) || m.lessons[0];
    c.append(
      el(
        "div",
        {
          class: "card",
          style: {
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            alignItems: "center",
          },
        },
        el(
          "div",
          { style: { flex: "1", minWidth: "200px" } },
          el(
            "div",
            { class: "row", style: { justifyContent: "space-between" } },
            el("b", null, "Your progress"),
            el(
              "span",
              { class: "mono muted" },
              `${pr.done}/${pr.total} lessons`,
            ),
          ),
          el(
            "div",
            { class: "progress", style: { marginTop: "8px" } },
            el("i", { style: { width: pr.pct + "%" } }),
          ),
        ),
        el(
          "a",
          { class: "btn primary magnetic", href: "#/l/" + firstOpen.id },
          pr.done ? "Continue →" : "Start module →",
        ),
      ),
    );
    if (m.outcomes)
      c.append(
        el(
          "div",
          { class: "card", style: { marginTop: "14px" } },
          el(
            "h3",
            { style: { margin: "0 0 8px", fontSize: "16px" } },
            "🎯 After this module you can…",
          ),
          el("ul", {
            class: "prose",
            style: { margin: 0 },
            html: m.outcomes.map((o) => `<li>${o}</li>`).join(""),
          }),
        ),
      );
    const pgs = [...SDA.playgrounds.values()].filter((p) => p.module === m.id);
    const labs = [...SDA.labs.values()].filter((p) => p.module === m.id);
    const cards =
      m.flashcards ||
      (m.quiz || [])
        .filter((q) => q.type !== "scenario")
        .map((q) => ({
          front: q.q,
          back: `<b>${q.options[q.answer]}</b><br><span class="muted">${q.why || ""}</span>`,
        }));
    const list = [
      {
        id: "lessons",
        label: "📘 Lessons",
        render: (p) => {
          const box = el("div", { class: "lesson-list" });
          m.lessons.forEach((l, i) =>
            box.append(
              el(
                "a",
                { class: "lesson-row", href: "#/l/" + l.id },
                el("span", { class: "ln" }, String(i + 1).padStart(2, "0")),
                el("span", { class: "lt" }, l.title),
                el("span", { class: "lm" }, `${l.minutes || 8} min`),
                el(
                  "span",
                  {
                    class: "ld" + (Store.isDone(l.id) ? " done" : ""),
                    "aria-label": Store.isDone(l.id)
                      ? "completed"
                      : "not completed",
                  },
                  Store.isDone(l.id) ? "✓" : "",
                ),
              ),
            ),
          );
          p.append(box);
        },
      },
    ];
    if (pgs.length)
      list.push({
        id: "playgrounds",
        label: `🧪 Playgrounds (${pgs.length})`,
        render: (p) => {
          const g = el("div", { class: "grid c2" });
          pgs.forEach((x) => g.append(pgCard(x)));
          p.append(g);
        },
      });
    if (m.quiz)
      list.push({
        id: "quiz",
        label: "🎯 Quiz",
        render: (p) => ui.quiz(p, m.quiz, { id: "mod:" + m.id }),
      });
    if (cards.length)
      list.push({
        id: "flashcards",
        label: "🃏 Flashcards",
        render: (p) => ui.flashcards(p, cards),
      });
    if (m.cheatsheet)
      list.push({
        id: "cheatsheet",
        label: "📋 Cheat sheet",
        render: (p) => renderCheat(p, m),
      });
    if (labs.length)
      list.push({
        id: "labs",
        label: "⌨️ Code labs",
        render: (p) =>
          labs.forEach((l) => {
            p.append(el("h3", null, l.title));
            if (l.explain)
              p.append(el("div", { class: "prose", html: l.explain }));
            ui.lab(p, l);
          }),
      });
    if (m.sources)
      list.push({
        id: "sources",
        label: "📚 Sources",
        render: (p) =>
          p.append(
            el("ul", {
              class: "prose",
              html: m.sources.map((s) => `<li>${s}</li>`).join(""),
            }),
          ),
      });
    ui.tabs(c, list, {
      initial: tab,
      onSelect: (tid, user) => {
        if (user) history.replaceState(null, "", "#/m/" + m.id + "/" + tid);
      },
    });
  };
  function renderCheat(p, m) {
    const text = () =>
      `${m.title} — cheat sheet\n\n` +
      m.cheatsheet
        .map(
          (s) =>
            `## ${SDA.u.stripHtml(s.h)}\n` +
            s.items.map((i) => "- " + SDA.u.stripHtml(i)).join("\n"),
        )
        .join("\n\n");
    p.append(
      el(
        "div",
        {
          class: "row",
          style: { justifyContent: "space-between", marginBottom: "12px" },
        },
        el(
          "span",
          { class: "muted" },
          "Everything in this module on one screen.",
        ),
        ui.button(
          "📋 Copy cheat sheet",
          async () => {
            const ok = await SDA.copyText(text());
            SDA.toast(ok ? "📋 Cheat sheet copied" : "Copy failed");
          },
          "sm",
        ),
      ),
    );
    const g = el("div", { class: "cheat" });
    m.cheatsheet.forEach((s) =>
      g.append(
        el(
          "div",
          { class: "card" },
          el("h4", { html: s.h }),
          el("ul", { html: s.items.map((i) => `<li>${i}</li>`).join("") }),
        ),
      ),
    );
    p.append(g);
  }
  function pgCard(p) {
    const m = SDA.modById.get(p.module);
    return el(
      "a",
      { class: "card glow", href: "#/pg/" + p.id },
      el(
        "div",
        { class: "row" },
        el("span", { class: "ico-lg", "aria-hidden": "true" }, p.icon || "🧪"),
        el("b", { style: { fontSize: "16px", color: "var(--text)" } }, p.title),
      ),
      el(
        "p",
        { class: "muted", style: { margin: "8px 0 0", fontSize: "14px" } },
        p.summary || "",
      ),
      m
        ? el(
            "div",
            { style: { marginTop: "10px" } },
            el("span", { class: "chip" }, `${m.icon || ""} ${m.title}`),
          )
        : null,
    );
  }

  /* ---------------- PLAYGROUNDS ---------------- */
  SDA.routes.playgrounds = function (ctx) {
    ctx.title = "Playgrounds";
    ctx.wide = true;
    const c = ctx.content;
    c.append(
      crumbs([
        ["#/", "Home"],
        [null, "Playgrounds"],
      ]),
      el("h1", { class: "page-title" }, "🧪 Interactive playgrounds"),
      el(
        "p",
        { class: "lead" },
        "Every concept you can break and fix. Real logic, live metrics, step-through controls.",
      ),
    );
    const all = [...SDA.playgrounds.values()];
    if (!all.length) {
      c.append(el("div", { class: "empty" }, "No playgrounds installed yet."));
      return;
    }
    const groups = new Map();
    all.forEach((p) => {
      const k = p.module || "other";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    });
    const order = [...groups.keys()].sort(
      (a, b) =>
        ((SDA.modById.get(a) || {}).order || 999) -
        ((SDA.modById.get(b) || {}).order || 999),
    );
    order.forEach((k) => {
      const m = SDA.modById.get(k);
      const g = el("div", { class: "grid c3" });
      groups.get(k).forEach((p) => g.append(pgCard(p)));
      c.append(
        el(
          "section",
          { class: "hub-group reveal" },
          el("h2", null, m ? `${m.icon || ""} ${m.title}` : "More"),
          g,
        ),
      );
    });
  };
  SDA.routes.pg = function (ctx) {
    const p = SDA.playgrounds.get(ctx.args[0]);
    if (!p) return notFound(ctx);
    const m = SDA.modById.get(p.module);
    const c = ctx.content;
    ctx.title = p.title;
    ctx.wide = true;
    ctx.track = { kind: "Playground", title: p.title, icon: p.icon || "🧪" };
    c.append(
      crumbs([
        ["#/", "Home"],
        ["#/playgrounds", "Playgrounds"],
        [null, p.title],
      ]),
    );
    c.append(el("h1", { class: "page-title" }, `${p.icon || "🧪"} ${p.title}`));
    if (p.summary) c.append(el("p", { class: "lead", html: p.summary }));
    if (m)
      c.append(
        el(
          "div",
          { class: "row" },
          el(
            "a",
            { class: "chip", href: "#/m/" + m.id },
            `${m.icon || ""} From: ${m.title}`,
          ),
        ),
      );
    mountPg(c, p.id, false);
    if (p.explain)
      c.append(
        el(
          "section",
          { class: "sec reveal" },
          el(
            "div",
            { class: "sec-h" },
            el("span", { class: "sec-n" }, "?"),
            el("h2", null, "What to notice"),
          ),
          el("div", { class: "prose", html: p.explain }),
        ),
      );
    if (p.real) {
      const s = el(
        "section",
        { class: "sec reveal" },
        el(
          "div",
          { class: "sec-h" },
          el("span", { class: "sec-n" }, "🌍"),
          el("h2", null, "Real world"),
        ),
      );
      const pr = el("div", { class: "prose" });
      pr.append(realEl(p.real));
      s.append(pr);
      c.append(s);
    }
  };

  /* ---------------- LABS ---------------- */
  SDA.routes.labs = function (ctx) {
    ctx.title = "Code labs";
    const c = ctx.content;
    c.append(
      crumbs([
        ["#/", "Home"],
        [null, "Code labs"],
      ]),
      el("h1", { class: "page-title" }, "⌨️ Runnable code labs"),
      el(
        "p",
        { class: "lead" },
        "Small, real implementations you can edit and run right here. Code runs in an isolated Web Worker, never on this page.",
      ),
    );
    const all = [...SDA.labs.values()];
    if (!all.length) {
      c.append(el("div", { class: "empty" }, "No code labs installed yet."));
      return;
    }
    const g = el("div", { class: "grid c2" });
    all.forEach((l) =>
      g.append(
        el(
          "a",
          { class: "card glow", href: "#/lab/" + l.id },
          el("b", { style: { color: "var(--text)" } }, "🧪 " + l.title),
          el(
            "p",
            { class: "muted", style: { margin: "6px 0 0", fontSize: "14px" } },
            l.summary || "",
          ),
        ),
      ),
    );
    c.append(g);
  };
  SDA.routes.lab = function (ctx) {
    const l = SDA.labs.get(ctx.args[0]);
    if (!l) return notFound(ctx);
    ctx.title = l.title;
    ctx.track = { kind: "Code lab", title: l.title, icon: "⌨️" };
    const c = ctx.content;
    c.append(
      crumbs([
        ["#/", "Home"],
        ["#/labs", "Code labs"],
        [null, l.title],
      ]),
      el("h1", { class: "page-title" }, "⌨️ " + l.title),
    );
    if (l.summary) c.append(el("p", { class: "lead", html: l.summary }));
    if (l.explain) c.append(el("div", { class: "prose", html: l.explain }));
    ui.lab(c, l);
    if (l.challenge)
      c.append(
        el("div", {
          class: "prose",
          html: SDA.h.callout("tip", "🏋️ Challenge", l.challenge),
        }),
      );
  };

  /* ---------------- GLOSSARY ---------------- */
  SDA.routes.glossary = function (ctx) {
    const target = ctx.args[0];
    ctx.title = "Glossary";
    const c = ctx.content;
    const terms = [...SDA.glossary.values()].sort((a, b) =>
      a.term.localeCompare(b.term, undefined, { sensitivity: "base" }),
    );
    c.append(
      crumbs([
        ["#/", "Home"],
        [null, "Glossary"],
      ]),
      el("h1", { class: "page-title" }, "📖 Glossary"),
      el(
        "p",
        { class: "lead" },
        `${terms.length} terms. Terms are auto-highlighted inside lessons — hover or tap them for a definition.`,
      ),
    );
    const input = el("input", {
      class: "input",
      type: "search",
      placeholder: "Filter terms…",
      "aria-label": "Filter glossary terms",
    });
    const letters = el("div", {
      class: "gl-letters",
      role: "group",
      "aria-label": "Filter by first letter",
    });
    const list = el("div", { class: "stack", style: { marginTop: "16px" } });
    let letter = "";
    const avail = new Set(terms.map((t) => t.term[0].toUpperCase()));
    ["All", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), "#"].forEach((L) => {
      if (L !== "All" && L !== "#" && !avail.has(L)) return;
      if (L === "#" && !terms.some((t) => !/^[A-Za-z]/.test(t.term))) return;
      const b = el(
        "button",
        {
          type: "button",
          "aria-pressed": String(L === "All"),
          style: L === "All" ? { width: "auto", padding: "0 10px" } : null,
        },
        L,
      );
      b.addEventListener("click", () => {
        letter = L === "All" ? "" : L;
        $$("button", letters).forEach((x) =>
          x.setAttribute("aria-pressed", String(x === b)),
        );
        apply();
      });
      letters.append(b);
    });
    const items = terms.map((t) => {
      const m = t.module && SDA.modById.get(t.module);
      const d = el("div", { class: "card gl-item", id: "g-" + t.id });
      d.append(
        el(
          "h3",
          null,
          t.term,
          ...(t.aka || []).map((a) => el("span", { class: "chip" }, a)),
          m
            ? el(
                "a",
                {
                  class: "chip",
                  href: "#/m/" + m.id,
                  style: { marginLeft: "auto" },
                },
                `${m.icon || ""} ${m.title}`,
              )
            : null,
        ),
        el("p", { class: "prose", html: esc(t.def) }),
      );
      list.append(d);
      return { t, d };
    });
    const apply = () => {
      const q = input.value.trim().toLowerCase();
      let shown = 0;
      items.forEach(({ t, d }) => {
        const L = /^[A-Za-z]/.test(t.term) ? t.term[0].toUpperCase() : "#";
        const ok =
          (!letter || L === letter) &&
          (!q ||
            (t.term + " " + (t.aka || []).join(" ") + " " + t.def)
              .toLowerCase()
              .includes(q));
        d.hidden = !ok;
        if (ok) shown++;
      });
      empty.hidden = shown > 0;
    };
    const empty = el(
      "div",
      { class: "empty", hidden: true },
      "No matching terms.",
    );
    input.addEventListener("input", SDA.u.debounce(apply, 80));
    c.append(input, letters, list, empty);
    if (target && SDA.glossary.has(target)) {
      ctx.scrollTo = "g-" + target;
      ctx.flash = true;
    }
  };

  /* ---------------- LEARNING PATH ---------------- */
  SDA.routes.path = function (ctx) {
    const p = SDA.paths.find((x) => x.id === ctx.args[0]);
    if (!p) return notFound(ctx);
    ctx.title = p.title;
    const c = ctx.content;
    c.append(
      crumbs([
        ["#/", "Home"],
        [null, "Learning path"],
      ]),
      el("h1", { class: "page-title" }, `${p.icon} ${p.title}`),
      el("p", { class: "lead" }, p.blurb),
    );
    const list = el("div", { class: "lesson-list" });
    let missing = 0;
    p.items.forEach((ref, i) => {
      const r = SDA.resolve(ref);
      const kind = KIND_NAME[ref.split(":")[0]] || "Item";
      if (!r) {
        missing++;
        list.append(
          el(
            "div",
            { class: "lesson-row locked" },
            el("span", { class: "ln" }, String(i + 1).padStart(2, "0")),
            el(
              "span",
              { class: "lt" },
              `${kind}: ${ref.split(":")[1].replace(/-/g, " ")}`,
            ),
            el("span", { class: "lm" }, "not installed yet"),
          ),
        );
        return;
      }
      list.append(
        el(
          "a",
          { class: "lesson-row", href: r.href },
          el("span", { class: "ln" }, String(i + 1).padStart(2, "0")),
          el("span", { "aria-hidden": "true" }, r.icon),
          el(
            "span",
            { class: "lt" },
            r.title,
            el(
              "div",
              { class: "lm", style: { fontWeight: "500" } },
              r.sub || kind,
            ),
          ),
          r.pct != null ? el("span", { class: "lm mono" }, r.pct + "%") : null,
        ),
      );
    });
    c.append(list);
    if (missing)
      c.append(
        el(
          "p",
          { class: "muted", style: { fontSize: "14px", marginTop: "14px" } },
          `${missing} item(s) belong to parts of the site that are not installed yet. They will appear here automatically.`,
        ),
      );
  };

  /* ---------------- ROADMAP ---------------- */
  SDA.routes.roadmap = function (ctx) {
    ctx.title = "Roadmap";
    const c = ctx.content;
    const o = overall();
    c.append(
      crumbs([
        ["#/", "Home"],
        [null, "Roadmap"],
      ]),
      el("h1", { class: "page-title" }, "🗺️ The roadmap"),
      el(
        "p",
        { class: "lead" },
        "Beginner → Intermediate → Advanced → Distributed Systems → Real-World Architecture → Principal Engineer Thinking. Tick lessons as you finish them — progress is saved in this browser.",
      ),
    );
    c.append(
      el(
        "div",
        { class: "card", style: { marginBottom: "28px" } },
        el(
          "div",
          { class: "row", style: { justifyContent: "space-between" } },
          el("b", null, "Overall progress"),
          el(
            "span",
            { class: "mono muted" },
            `${o.done}/${o.total} lessons · ${o.pct}%`,
          ),
        ),
        el(
          "div",
          { class: "progress", style: { marginTop: "8px" } },
          el("i", { style: { width: o.pct + "%" } }),
        ),
      ),
    );
    const rm = el("div", { class: "roadmap" });
    SDA.LEVELS.forEach((lv) => {
      const mods = SDA.modules.filter((m) => m.level === lv.id);
      const extras = SDA.nav.filter((n) => n.group === lv.id);
      const L = el(
        "section",
        { class: "rm-level reveal" },
        el("span", { class: "rm-dot", "aria-hidden": "true" }, lv.icon),
        el("h2", null, lv.name),
        el("p", { class: "muted", style: { margin: "0 0 6px" } }, lv.blurb),
      );
      if (!mods.length && !extras.length)
        L.append(
          el(
            "div",
            { class: "empty", style: { padding: "14px", textAlign: "left" } },
            "Modules for this level arrive in later parts of the site.",
          ),
        );
      mods.forEach((m) => {
        const pr = modProgress(m);
        const prog = el(
          "span",
          { class: "chip mono" },
          `${pr.done}/${pr.total}`,
        );
        const box = el(
          "div",
          { class: "card rm-mod" },
          el(
            "div",
            { class: "rm-h" },
            el(
              "h3",
              null,
              el("a", { href: "#/m/" + m.id }, `${m.icon || ""} ${m.title}`),
            ),
            prog,
          ),
        );
        const ls = el("div", { class: "rm-lessons" });
        m.lessons.forEach((l) => {
          const inp = el("input", {
            type: "checkbox",
            "aria-label": "Completed: " + l.title,
          });
          inp.checked = Store.isDone(l.id);
          inp.addEventListener("change", () => {
            Store.setDone(l.id, inp.checked);
            const p2 = modProgress(m);
            prog.textContent = `${p2.done}/${p2.total}`;
          });
          ls.append(
            el(
              "label",
              { class: "check", style: { fontWeight: "500" } },
              inp,
              el("a", { href: "#/l/" + l.id }, l.title),
            ),
          );
        });
        box.append(ls);
        L.append(box);
      });
      extras.forEach((n) =>
        L.append(
          el(
            "a",
            {
              class: "card glow rm-mod",
              href: n.href,
              style: { display: "block" },
            },
            el(
              "b",
              { style: { color: "var(--text)" } },
              `${n.icon || ""} ${n.label}`,
            ),
            n.desc
              ? el(
                  "div",
                  { class: "muted", style: { fontSize: "14px" } },
                  n.desc,
                )
              : null,
          ),
        ),
      );
      rm.append(L);
    });
    c.append(rm);
    c.append(
      el(
        "div",
        { class: "row", style: { marginTop: "20px" } },
        ui.button(
          "Reset all progress",
          () => {
            if (
              confirm(
                "Reset all lesson progress and quiz scores in this browser?",
              )
            ) {
              Store.data.done = {};
              Store.data.quiz = {};
              Store.save();
              render();
              SDA.toast("Progress reset");
            }
          },
          "sm danger",
        ),
      ),
    );
  };

  /* ---------------- CUSTOM PAGES ---------------- */
  SDA.routes.page = function (ctx) {
    const p = SDA.pages.get(ctx.args[0]);
    if (!p) return notFound(ctx);
    ctx.title = p.title;
    ctx.track = { kind: "Page", title: p.title, icon: p.icon || "📄" };
    ctx.args = ctx.args.slice(1);
    ctx.sub = ctx.args;
    p.render(ctx);
  };

  /* ---------------- HOME ---------------- */
  SDA.routes[""] = function (ctx) {
    ctx.wide = true;
    const c = ctx.content;
    const hero = el("section", { class: "hero", "aria-label": "Introduction" });
    const cv = el("canvas", { "aria-hidden": "true" });
    const typer = el("div", { class: "typer", "aria-live": "off" });
    hero.append(
      cv,
      el(
        "div",
        { class: "hero-in" },
        el(
          "h1",
          null,
          el("span", { class: "shimmer" }, "Learn system design"),
          el("br"),
          "the way it is ",
          el("span", { class: "grad-text" }, "actually built."),
        ),
        typer,
        el(
          "div",
          { class: "cta" },
          el(
            "a",
            {
              class: "btn primary magnetic",
              href: "#/path/beginner",
              style: { padding: "12px 22px", fontSize: "15px" },
            },
            "Start from zero →",
          ),
          el(
            "a",
            {
              class: "btn magnetic",
              href: "#/roadmap",
              style: { padding: "12px 22px", fontSize: "15px" },
            },
            "🗺️ See the roadmap",
          ),
          el(
            "button",
            {
              type: "button",
              class: "btn ghost magnetic",
              style: { padding: "12px 22px", fontSize: "15px" },
              onclick: openPalette,
            },
            "⌘ Search",
          ),
        ),
      ),
      el("div", { class: "scroll-cue", "aria-hidden": "true" }, el("i")),
    );
    c.append(hero);
    heroNetwork(cv, hero);
    typewriter(typer);

    const st = el("div", { class: "stats" });
    const stats = [
      ["Modules", SDA.modules.length],
      ["Lessons", SDA.lessons.size],
      ["Playgrounds", SDA.playgrounds.size],
      ["Glossary terms", SDA.glossary.size],
    ].concat(
      SDA.statProviders
        .map((p) => {
          try {
            return [p.label, p.count()];
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean),
    );
    stats.forEach(([l, n]) => {
      const num = el("div", { class: "n grad-text" }, "0");
      st.append(
        el(
          "div",
          { class: "card stat glow reveal" },
          num,
          el("div", { class: "l" }, l),
        ),
      );
      SDA.ui.countUp(num, n);
    });
    c.append(st);

    const last = Store.data.last;
    const firstLesson = SDA.modules[0] && SDA.modules[0].lessons[0];
    const o = overall();
    c.append(
      el(
        "div",
        { class: "card glow continue reveal" },
        el(
          "div",
          { class: "ci", "aria-hidden": "true" },
          last ? last.icon || "📘" : "🚀",
        ),
        el(
          "div",
          { class: "ct" },
          el(
            "span",
            { class: "muted", style: { fontSize: "13px" } },
            last
              ? `Continue where you left off · ${last.kind || ""}`
              : "Your first step",
          ),
          el(
            "b",
            null,
            last
              ? last.title
              : firstLesson
                ? firstLesson.title
                : "Open the roadmap",
          ),
          el(
            "div",
            {
              class: "progress",
              style: { marginTop: "8px", maxWidth: "360px" },
            },
            el("i", { style: { width: o.pct + "%" } }),
          ),
        ),
        el(
          "a",
          {
            class: "btn primary magnetic",
            href: last
              ? last.href
              : firstLesson
                ? "#/l/" + firstLesson.id
                : "#/roadmap",
          },
          last ? "Resume →" : "Begin →",
        ),
      ),
    );

    c.append(
      el(
        "div",
        { class: "sect-h reveal" },
        el(
          "div",
          null,
          el("h2", null, "Pick a learning path"),
          el(
            "p",
            null,
            "Five routes through the same material. Switch any time — progress is shared.",
          ),
        ),
      ),
    );
    const pg = el("div", { class: "grid c3" });
    SDA.paths.forEach((p) => {
      const have = p.items.filter((r) => SDA.resolve(r)).length;
      pg.append(
        el(
          "a",
          { class: "card glow path-card reveal", href: "#/path/" + p.id },
          el("div", { class: "pi", "aria-hidden": "true" }, p.icon),
          el("h3", null, p.title),
          el("p", null, p.blurb),
          el(
            "div",
            { class: "meta" },
            el("span", { class: "chip" }, `${p.items.length} stops`),
            el("span", { class: "chip" }, `${have} available`),
          ),
        ),
      );
    });
    c.append(pg);

    c.append(
      el(
        "div",
        { class: "sect-h reveal" },
        el(
          "div",
          null,
          el("h2", null, "How every lesson teaches"),
          el(
            "p",
            null,
            "No hand-waving. Each concept follows the same seven beats, with a Simple and a Deep-dive layer.",
          ),
        ),
      ),
    );
    const method = el("div", { class: "method" });
    [
      ["A small example", "a real situation"],
      ["The everyday picture", "everyday analogy"],
      ["Step by step", "animated diagram"],
      ["When to use it", "good fit / poor fit / other options"],
      ["Real life", "named companies"],
      ["Common mistakes", "+ interview angle"],
      ["Try it yourself", "break it, fix it"],
    ].forEach(([t, d], i) =>
      method.append(
        el(
          "div",
          { class: "mstep reveal" },
          el("b", null, String(i + 1).padStart(2, "0")),
          el("span", null, t),
          el("p", null, d),
        ),
      ),
    );
    c.append(method);

    c.append(
      el(
        "div",
        { class: "sect-h reveal" },
        el(
          "div",
          null,
          el("h2", null, "Modules"),
          el(
            "p",
            null,
            "Grouped by level. Each has lessons, playgrounds, a quiz, flashcards and a cheat sheet.",
          ),
        ),
        el("a", { class: "btn sm", href: "#/roadmap" }, "Full roadmap →"),
      ),
    );
    const mg = el("div", { class: "grid c3" });
    SDA.modules.forEach((m) => {
      const pr = modProgress(m);
      const lv = SDA.LEVELS.find((x) => x.id === m.level) || {};
      mg.append(
        el(
          "a",
          { class: "card glow reveal", href: "#/m/" + m.id },
          el(
            "div",
            { class: "row", style: { justifyContent: "space-between" } },
            el(
              "span",
              { class: "ico-lg", "aria-hidden": "true" },
              m.icon || "📦",
            ),
            el("span", { class: "chip lvl" }, lv.name || ""),
          ),
          el(
            "h3",
            {
              style: {
                margin: "10px 0 4px",
                fontSize: "17px",
                color: "var(--text)",
              },
            },
            m.title,
          ),
          el(
            "p",
            { class: "muted", style: { margin: "0 0 10px", fontSize: "14px" } },
            m.summary
              ? SDA.u.stripHtml(m.summary).slice(0, 130) +
                  (m.summary.length > 130 ? "…" : "")
              : "",
          ),
          el(
            "div",
            { class: "progress" },
            el("i", { style: { width: pr.pct + "%" } }),
          ),
          el(
            "div",
            {
              class: "lm mono",
              style: {
                fontSize: "12px",
                color: "var(--faint)",
                marginTop: "6px",
              },
            },
            `${pr.done}/${pr.total} lessons`,
          ),
        ),
      );
    });
    if (!SDA.modules.length)
      mg.append(el("div", { class: "empty" }, "No modules installed yet."));
    c.append(mg);

    c.append(
      el(
        "div",
        { class: "sect-h reveal" },
        el(
          "div",
          null,
          el("h2", null, "Read every diagram the same way"),
          el(
            "p",
            null,
            "Components keep one colour and one shape everywhere on this site.",
          ),
        ),
      ),
    );
    const demo = el("div", { class: "reveal" });
    c.append(demo);
    new SDA.Diagram(demo, {
      title: "The colour legend in action",
      w: 860,
      h: 250,
      alt: "A request flows from a client through the CDN, load balancer, service, cache and database, with a queue feeding an external service.",
      nodes: [
        { id: "c", type: "client", label: "Phone app", x: 70, y: 125 },
        { id: "cdn", type: "cdn", label: "CDN edge", x: 215, y: 55 },
        { id: "lb", type: "lb", label: "Load balancer", x: 230, y: 180 },
        { id: "s", type: "service", label: "API service", x: 400, y: 180 },
        { id: "ca", type: "cache", label: "Redis cache", x: 570, y: 90 },
        { id: "db", type: "db", label: "Postgres", x: 570, y: 200 },
        { id: "q", type: "queue", label: "Queue", x: 730, y: 150, w: 100 },
        { id: "x", type: "ext", label: "SMS provider", x: 730, y: 60, w: 120 },
      ],
      edges: [
        { from: "c", to: "cdn" },
        { from: "c", to: "lb" },
        { from: "lb", to: "s" },
        { from: "s", to: "ca" },
        { from: "s", to: "db" },
        { from: "s", to: "q", curve: 0.15 },
        { from: "q", to: "x" },
      ],
      steps: [
        {
          note: "Static files (images, JS) come from the <b>CDN</b> edge close to the user.",
          flow: [
            ["c", "cdn", "GET img"],
            ["cdn", "c"],
          ],
          hl: ["cdn"],
        },
        {
          note: "API calls go to the <b>load balancer</b>, which picks a healthy <b>service</b> instance.",
          flow: [
            ["c", "lb", "POST"],
            ["lb", "s"],
          ],
          hl: ["lb", "s"],
        },
        {
          note: "The service checks the <b>cache</b> first; a miss falls through to the <b>database</b>.",
          flow: [
            ["s", "ca", "GET"],
            ["ca", "s", "miss"],
            ["s", "db", "SELECT"],
            ["db", "s"],
          ],
          hl: ["ca", "db"],
        },
        {
          note: "Slow side-work goes onto a <b>queue</b> so the user is not kept waiting; a worker calls the <b>external</b> SMS API later.",
          flow: [
            ["s", "q", "event"],
            ["q", "x", "send"],
          ],
          hl: ["q", "x"],
        },
        {
          note: "The response returns to the client. Every diagram on this site has Play / Pause / Step / Reset / Speed.",
          flow: [
            ["s", "lb"],
            ["lb", "c", "200 OK"],
          ],
          hl: ["c"],
        },
      ],
    });

    c.append(
      el(
        "div",
        { class: "sect-h reveal" },
        el(
          "div",
          null,
          el("h2", null, "Honest by design"),
          el(
            "p",
            null,
            "Architecture claims carry one of three labels so you always know what kind of statement you are reading.",
          ),
        ),
      ),
    );
    c.append(
      el(
        "div",
        { class: "grid c3" },
        ...[
          [
            "confirmed",
            "Publicly confirmed",
            "Stated by the company in an engineering blog, paper, talk or official documentation.",
          ],
          [
            "inference",
            "Reasonable inference",
            "Not officially documented, but what the public evidence and standard practice strongly suggest.",
          ],
          [
            "educational",
            "Simplified educational design",
            "A reference design built to teach the idea. Real systems are more complex — and often proprietary.",
          ],
        ].map(([k, t, d]) =>
          el(
            "div",
            { class: "card reveal" },
            el("div", { html: SDA.h.tier(k) }),
            el(
              "p",
              {
                class: "muted",
                style: { margin: "10px 0 0", fontSize: "14px" },
              },
              d,
            ),
          ),
        ),
      ),
    );
    c.append(
      el(
        "footer",
        { class: "footer" },
        el(
          "span",
          null,
          "© System Design Playbook — a single self-contained HTML file.",
        ),
        el(
          "span",
          null,
          "Press ",
          el("kbd", null, "Ctrl"),
          " ",
          el("kbd", null, "K"),
          " to search anything.",
        ),
        SDA.errors.length
          ? el(
              "span",
              { style: { color: "var(--warn)" } },
              `${SDA.errors.length} content block(s) failed to load — see the browser console.`,
            )
          : null,
      ),
    );
  };

  function heroNetwork(canvas, host) {
    const g = canvas.getContext("2d");
    if (!g) return;
    let W = 0,
      H = 0,
      nodes = [],
      packets = [],
      spawnT = 0,
      colA = "#22d3ee",
      colB = "#8b5cf6";
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      colA = cs.getPropertyValue("--accent1").trim() || colA;
      colB = cs.getPropertyValue("--accent2").trim() || colB;
    };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(clamp((W * H) / 15000, 22, 85));
      nodes = Array.from({ length: n }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.5) * 16,
        r: 1.4 + Math.random() * 2.4,
        c: Math.random(),
      }));
      packets = [];
      readColors();
      draw(0);
    };
    const maxD = () => clamp(W / 7, 110, 180);
    function draw(dt) {
      if (!W) return;
      g.clearRect(0, 0, W, H);
      for (const n of nodes) {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
        n.x = clamp(n.x, 0, W);
        n.y = clamp(n.y, 0, H);
      }
      const D = maxD(),
        pairs = [];
      g.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i],
            b = nodes[j],
            d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < D) {
            g.globalAlpha = (1 - d / D) * 0.32;
            g.strokeStyle = (a.c + b.c) / 2 > 0.5 ? colB : colA;
            g.beginPath();
            g.moveTo(a.x, a.y);
            g.lineTo(b.x, b.y);
            g.stroke();
            pairs.push([a, b]);
          }
        }
      for (const n of nodes) {
        g.globalAlpha = 0.85;
        g.fillStyle = n.c > 0.5 ? colB : colA;
        g.beginPath();
        g.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        g.fill();
      }
      spawnT += dt;
      if (dt && spawnT > 0.22 && pairs.length && packets.length < 26) {
        spawnT = 0;
        const [a, b] = pairs[Math.floor(Math.random() * pairs.length)];
        packets.push(
          Math.random() < 0.5
            ? { a, b, t: 0, d: 0.8 + Math.random() * 0.9 }
            : { a: b, b: a, t: 0, d: 0.8 + Math.random() * 0.9 },
        );
      }
      packets = packets.filter((p) => (p.t += dt / p.d) < 1);
      for (const p of packets) {
        const e = SDA.u.ease.inOut(p.t);
        for (let k = 4; k >= 0; k--) {
          const q = Math.max(0, e - k * 0.035);
          const x = p.a.x + (p.b.x - p.a.x) * q,
            y = p.a.y + (p.b.y - p.a.y) * q;
          g.globalAlpha = k === 0 ? 1 : 0.35 - k * 0.06;
          g.fillStyle = k === 0 ? "#ffffff" : colA;
          g.beginPath();
          g.arc(x, y, k === 0 ? 2.6 : 2.2 - k * 0.3, 0, Math.PI * 2);
          g.fill();
        }
        const x = p.a.x + (p.b.x - p.a.x) * e,
          y = p.a.y + (p.b.y - p.a.y) * e;
        const rg = g.createRadialGradient(x, y, 0, x, y, 12);
        rg.addColorStop(0, colA);
        rg.addColorStop(1, "transparent");
        g.globalAlpha = 0.5;
        g.fillStyle = rg;
        g.beginPath();
        g.arc(x, y, 12, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(SDA.u.debounce(resize, 80));
      ro.observe(host);
      SDA.onDispose(() => ro.disconnect());
    }
    const onTheme = () => {
      readColors();
      if (SDA.reduced) draw(0);
    };
    document.addEventListener("sda:theme", onTheme);
    SDA.onDispose(() => document.removeEventListener("sda:theme", onTheme));
    requestAnimationFrame(resize);
    if (!SDA.reduced) SDA.loop(host, (dt) => draw(dt));
  }
  function typewriter(node) {
    const phrases = [
      ["how ", "WhatsApp", " delivers a message to an offline friend"],
      ["how ", "IRCTC", " survives Tatkal at 10:00 AM"],
      ["how ", "UPI", " moves money in a couple of seconds"],
      ["how ", "Netflix", " streams to millions at once"],
      ["how ", "Uber", " finds the closest driver"],
      ["how ", "Google", " answers a search in a blink"],
    ];
    const caret = '<span class="caret" aria-hidden="true"></span>';
    const html = (p, n) => {
      let left = n,
        out = "";
      p.forEach((s, i) => {
        const take = s.slice(0, Math.max(0, left));
        left -= s.length;
        out += i === 1 ? `<b>${esc(take)}</b>` : esc(take);
      });
      return out + caret;
    };
    node.setAttribute(
      "aria-label",
      "Learn " + phrases.map((p) => p.join("")).join("; "),
    );
    if (SDA.reduced) {
      let k = 0;
      node.innerHTML = html(phrases[0], 999);
      const iv = setInterval(() => {
        k = (k + 1) % phrases.length;
        node.innerHTML = html(phrases[k], 999);
      }, 4000);
      SDA.onDispose(() => clearInterval(iv));
      return;
    }
    let k = 0,
      n = 0,
      dir = 1,
      tm = 0;
    const tick = () => {
      const p = phrases[k],
        len = p.join("").length;
      node.innerHTML = html(p, n);
      if (dir > 0) {
        if (n < len) {
          n++;
          tm = setTimeout(tick, 42);
        } else {
          dir = -1;
          tm = setTimeout(tick, 1700);
        }
      } else {
        if (n > 0) {
          n -= 2;
          tm = setTimeout(tick, 16);
        } else {
          n = 0;
          dir = 1;
          k = (k + 1) % phrases.length;
          tm = setTimeout(tick, 300);
        }
      }
    };
    tick();
    SDA.onDispose(() => clearTimeout(tm));
  }

  /* ---------------- SIDEBAR + PROGRESS RING ---------------- */
  function renderSidebar() {
    const sb = $("#sidebar");
    const keep = sb.scrollTop;
    const route = parseHash();
    const hash = location.hash || "#/";
    let curMod = null;
    if (route.name === "m") curMod = route.args[0];
    else if (route.name === "l") {
      const l = SDA.lessons.get(route.args[0]);
      curMod = l && l.module;
    } else if (route.name === "pg") {
      const p = SDA.playgrounds.get(route.args[0]);
      curMod = p && p.module;
    }
    const curLesson = route.name === "l" ? route.args[0] : null;
    const curMObj = curMod ? SDA.modules.find((m) => m.id === curMod) : null;
    const curLevel = curMObj ? curMObj.level : null;
    // With no choice made yet, open the level you are in. Elsewhere, open the level of the first unfinished module.
    const nextMod = SDA.modules.find((m) => modProgress(m).done < modProgress(m).total) || SDA.modules[0];
    const openLevel = curLevel || (nextMod && nextMod.level);
    const isActive = (href) =>
      href === "#/"
        ? hash === "#/" || hash === "" || hash === "#"
        : hash === href || hash.startsWith(href + "/");
    sb.innerHTML = "";
    // A group is open if the reader chose so. With no choice yet, only the group that holds this page starts open.
    const group = (key, title, build, opt) => {
      opt = opt || {};
      const saved = Store.data.sb[key];
      const collapsed = opt.here ? false : saved === undefined ? !opt.open : !!saved;
      const g = el("div", {
        class: "sb-group" + (collapsed ? " collapsed" : ""),
      });
      const btn = el(
        "button",
        {
          type: "button",
          class: "sb-title",
          "aria-expanded": String(!collapsed),
        },
        el("span", { class: "sb-title-t" }, title),
        opt.meta ? el("span", { class: "sb-meta" }, opt.meta) : null,
        el("span", { class: "chev", "aria-hidden": "true" }, "▾"),
      );
      btn.addEventListener("click", () => {
        const c = !g.classList.contains("collapsed");
        g.classList.toggle("collapsed", c);
        btn.setAttribute("aria-expanded", String(!c));
        Store.data.sb[key] = c;
        Store.save();
      });
      const ul = el("ul", { class: "sb-list" });
      build(ul);
      g.append(btn, ul);
      sb.append(g);
    };
    const link = (href, icon, label) =>
      el(
        "li",
        null,
        el(
          "a",
          {
            class: "sb-link" + (isActive(href) ? " active" : ""),
            href,
            "aria-current": isActive(href) ? "page" : null,
          },
          el("span", { class: "ic", "aria-hidden": "true" }, icon),
          el("span", { class: "lbl" }, label),
        ),
      );
    const onHref = (hrefs) => hrefs.some((h) => isActive(h));
    // "Continue" shortcut: the last page you opened, unless you are on it now.
    const last = Store.data.last;
    const firstLesson = SDA.modules[0] && SDA.modules[0].lessons[0];
    const goHref = last && last.href ? last.href : firstLesson ? "#/l/" + firstLesson.id : null;
    if (goHref && !isActive(goHref)) {
      sb.append(
        el(
          "a",
          { class: "sb-continue", href: goHref },
          el("span", { class: "sb-continue-k" }, last ? "Continue" : "Start here"),
          el("span", { class: "sb-continue-t" }, last ? `${last.icon || "📘"} ${last.title}` : firstLesson.title),
        ),
      );
    }
    const exploreNav = SDA.nav.filter((n) => !n.group || n.group === "explore");
    const refNav = exploreNav.filter((n) => n.href === "#/page/cheatsheets");
    const practiceNav = exploreNav.filter((n) => n.href !== "#/page/cheatsheets");
    const practiceHrefs = ["#/playgrounds", "#/labs", ...practiceNav.map((n) => n.href), "#/pg", "#/lab", "#/case"];
    const refHrefs = ["#/glossary", ...refNav.map((n) => n.href)];
    group("explore", "Start", (ul) => {
      ul.append(link("#/", "🏠", "Home"), link("#/roadmap", "🗺️", "Roadmap"));
    }, { open: true });
    group("practice", "Practice", (ul) => {
      if (SDA.playgrounds.size) ul.append(link("#/playgrounds", "🧪", "Playgrounds"));
      if (SDA.labs.size) ul.append(link("#/labs", "⌨️", "Code labs"));
      practiceNav.forEach((n) => ul.append(link(n.href, n.icon || "•", n.label)));
    }, { here: onHref(practiceHrefs) && !curMod });
    group("reference", "Reference", (ul) => {
      if (SDA.glossary.size) ul.append(link("#/glossary", "📖", "Glossary"));
      refNav.forEach((n) => ul.append(link(n.href, n.icon || "•", n.label)));
    }, { here: onHref(refHrefs) });
    SDA.LEVELS.forEach((lv) => {
      const mods = SDA.modules.filter((m) => m.level === lv.id);
      const extras = SDA.nav.filter((n) => n.group === lv.id);
      if (!mods.length && !extras.length) return;
      const lvDone = mods.reduce((n, m) => n + modProgress(m).done, 0);
      const lvTotal = mods.reduce((n, m) => n + modProgress(m).total, 0);
      group("lv-" + lv.id, `${lv.icon} ${lv.name}`, (ul) => {
        mods.forEach((m) => {
          const pr = modProgress(m);
          const li = el(
            "li",
            null,
            el(
              "a",
              {
                class:
                  "sb-link" + (curMod === m.id && !curLesson ? " active" : ""),
                href: "#/m/" + m.id,
              },
              el(
                "span",
                { class: "ic", "aria-hidden": "true" },
                m.icon || "📦",
              ),
              el(
                "span",
                { class: "lbl" },
                m.title,
              ),
              el(
                "span",
                { class: "count" + (pr.total && pr.done === pr.total ? " all" : "") },
                pr.total && pr.done === pr.total ? "✓" : `${pr.done}/${pr.total}`,
              ),
            ),
          );
          if (curMod === m.id) {
            const sub = el("ul", { class: "sb-sub" });
            m.lessons.forEach((l) =>
              sub.append(
                el(
                  "li",
                  null,
                  el(
                    "a",
                    {
                      href: "#/l/" + l.id,
                      class: curLesson === l.id ? "active" : null,
                      "aria-current": curLesson === l.id ? "page" : null,
                    },
                    el(
                      "span",
                      {
                        class: "dot" + (Store.isDone(l.id) ? " done" : ""),
                        "aria-hidden": "true",
                      },
                      Store.isDone(l.id) ? "✓" : "",
                    ),
                    el("span", null, l.title),
                  ),
                ),
              ),
            );
            li.append(sub);
          }
          ul.append(li);
        });
        extras.forEach((n) => {
          ul.append(link(n.href, n.icon || "•", n.label));
        });
      }, {
        open: lv.id === openLevel,
        here: lv.id === curLevel || extras.some((n) => isActive(n.href)),
        meta: lvTotal ? `${lvDone}/${lvTotal}` : null,
      });
    });
    sb.scrollTop = keep;
    // Keep "you are here" visible inside the sidebar.
    const act = sb.querySelector(".sb-sub a.active, .sb-link.active");
    if (act) {
      const r = act.getBoundingClientRect(), b = sb.getBoundingClientRect();
      if (r.height && (r.top < b.top + 8 || r.bottom > b.bottom - 8)) sb.scrollTop += r.top - b.top - b.height / 3;
    }
  }
  function updateRing() {
    const o = overall();
    const C = 100.53;
    const fg = $("#progressRing .ring-fg");
    if (fg) fg.style.strokeDashoffset = String(C * (1 - o.pct / 100));
    $("#ringPct").textContent = o.pct + "%";
    $("#progressRing").setAttribute(
      "aria-label",
      `Overall progress: ${o.done} of ${o.total} lessons complete (${o.pct}%). Open roadmap.`,
    );
  }
  SDA.refresh = () => {
    renderSidebar();
    updateRing();
  };
  function closeNav() {
    document.body.classList.remove("nav-open");
    $("#menuBtn").setAttribute("aria-expanded", "false");
  }

  /* ---------------- COMMAND PALETTE ---------------- */
  const pal = { open: false, items: [], sel: 0, prevFocus: null };
  function searchIndex() {
    const it = [];
    const P = (kind, icon, title, sub, href, kw) =>
      it.push({ kind, icon, title, sub: sub || "", href, kw: kw || "" });
    P("Pages", "🏠", "Home", "Start page", "#/");
    P(
      "Pages",
      "🗺️",
      "Roadmap",
      "All levels and lessons with checkboxes",
      "#/roadmap",
    );
    if (SDA.playgrounds.size)
      P(
        "Pages",
        "🧪",
        "Playgrounds",
        "All interactive simulations",
        "#/playgrounds",
      );
    if (SDA.labs.size)
      P("Pages", "⌨️", "Code labs", "Runnable JavaScript labs", "#/labs");
    if (SDA.glossary.size)
      P("Pages", "📖", "Glossary", `${SDA.glossary.size} terms`, "#/glossary");
    SDA.nav.forEach((n) =>
      P("Pages", n.icon || "•", n.label, n.desc || "", n.href),
    );
    SDA.paths.forEach((p) =>
      P("Learning paths", p.icon, p.title, p.blurb, "#/path/" + p.id),
    );
    SDA.modules.forEach((m) => {
      P(
        "Modules",
        m.icon || "📦",
        m.title,
        SDA.u.stripHtml(m.summary || ""),
        "#/m/" + m.id,
        (m.tags || []).join(" "),
      );
      m.lessons.forEach((l) =>
        P(
          "Lessons",
          "📘",
          l.title,
          m.title,
          "#/l/" + l.id,
          (l.tags || []).join(" ") + " " + SDA.u.stripHtml(l.summary || ""),
        ),
      );
    });
    SDA.playgrounds.forEach((p) =>
      P(
        "Playgrounds",
        p.icon || "🧪",
        p.title,
        SDA.u.stripHtml(p.summary || ""),
        "#/pg/" + p.id,
      ),
    );
    SDA.labs.forEach((l) =>
      P(
        "Code labs",
        "⌨️",
        l.title,
        SDA.u.stripHtml(l.summary || ""),
        "#/lab/" + l.id,
      ),
    );
    SDA.pages.forEach((p) =>
      P(
        "Pages",
        p.icon || "📄",
        p.title,
        p.summary || "",
        "#/page/" + p.id,
        p.keywords || "",
      ),
    );
    SDA.searchProviders.forEach((fn) => {
      try {
        (fn() || []).forEach((x) =>
          it.push(Object.assign({ sub: "", kw: "" }, x)),
        );
      } catch (e) {
        console.error(e);
      }
    });
    SDA.glossary.forEach((t) =>
      P(
        "Glossary",
        "📖",
        t.term,
        t.def,
        "#/glossary/" + t.id,
        (t.aka || []).join(" "),
      ),
    );
    return it;
  }
  const KIND_ORDER = [
    "Lessons",
    "Modules",
    "Playgrounds",
    "Case studies",
    "Code labs",
    "Practice",
    "Learning paths",
    "Pages",
    "Glossary",
  ];
  function scoreItem(q, x) {
    const t = x.title.toLowerCase(),
      hay = (t + " " + x.sub + " " + x.kw).toLowerCase();
    let s = 0;
    if (t === q) s = 100;
    else if (t.startsWith(q)) s = 82;
    else if (
      new RegExp("\\b" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(t)
    )
      s = 68;
    else if (t.includes(q)) s = 56;
    else if (hay.includes(q)) s = 34;
    else {
      const ws = q.split(/\s+/).filter(Boolean);
      if (ws.length > 1 && ws.every((w) => hay.includes(w))) s = 30;
      else {
        let i = 0;
        for (const ch of t) {
          if (ch === q[i]) i++;
          if (i === q.length) break;
        }
        if (i === q.length && q.length > 2) s = 12;
      }
    }
    if (s && x.kind === "Glossary") s -= 4;
    return s;
  }
  function hl(text, q) {
    const t = esc(text);
    if (!q) return t;
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return t;
    return (
      esc(text.slice(0, i)) +
      "<mark>" +
      esc(text.slice(i, i + q.length)) +
      "</mark>" +
      esc(text.slice(i + q.length))
    );
  }
  function palRender() {
    const q = $("#palInput").value.trim().toLowerCase();
    const res = $("#palRes");
    res.innerHTML = "";
    let list;
    if (!q) {
      const idx = searchIndex();
      list = [];
      if (Store.data.last)
        list.push({
          kind: "Continue",
          icon: Store.data.last.icon || "📘",
          title: Store.data.last.title,
          sub: "Continue where you left off",
          href: Store.data.last.href,
        });
      list.push(
        ...idx
          .filter((x) => x.kind === "Pages" || x.kind === "Learning paths")
          .slice(0, 9),
        ...idx.filter((x) => x.kind === "Modules"),
        ...idx.filter((x) => x.kind === "Playgrounds").slice(0, 6),
      );
    } else {
      list = searchIndex()
        .map((x) => Object.assign({ s: scoreItem(q, x) }, x))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s);
      const per = {};
      list = list
        .filter((x) => (per[x.kind] = (per[x.kind] || 0) + 1) <= 8)
        .slice(0, 48);
      list.sort((a, b) => {
        const ka = KIND_ORDER.indexOf(a.kind),
          kb = KIND_ORDER.indexOf(b.kind);
        const best = (k) =>
          Math.max(...list.filter((x) => x.kind === k).map((x) => x.s));
        return best(b.kind) - best(a.kind) || ka - kb || b.s - a.s;
      });
    }
    pal.items = list;
    pal.sel = 0;
    if (!list.length) {
      res.append(
        el(
          "div",
          { class: "pal-empty" },
          `No results for “${q}”. Try “cache”, “DNS”, “p99” or “sharding”.`,
        ),
      );
      return;
    }
    let lastKind = null;
    list.forEach((x, i) => {
      if (x.kind !== lastKind) {
        res.append(
          el("div", { class: "pal-grp", role: "presentation" }, x.kind),
        );
        lastKind = x.kind;
      }
      const row = el("div", {
        class: "pal-item",
        role: "option",
        id: "pal-" + i,
        "aria-selected": String(i === 0),
        html: `<span class="pi" aria-hidden="true">${x.icon || "•"}</span><span class="pt"><b>${hl(x.title, q)}</b><small>${esc(SDA.u.stripHtml(x.sub || "")).slice(0, 140)}</small></span>`,
      });
      row.addEventListener("click", () => palGo(i));
      row.addEventListener("mousemove", () => palSel(i, false));
      res.append(row);
    });
    $("#palInput").setAttribute("aria-activedescendant", "pal-0");
  }
  function palSel(i, scroll) {
    pal.sel = clamp(i, 0, pal.items.length - 1);
    $$(".pal-item").forEach((r) =>
      r.setAttribute("aria-selected", String(r.id === "pal-" + pal.sel)),
    );
    const r = $("#pal-" + pal.sel);
    if (r && scroll !== false) r.scrollIntoView({ block: "nearest" });
    $("#palInput").setAttribute("aria-activedescendant", "pal-" + pal.sel);
  }
  function palGo(i) {
    const x = pal.items[i];
    if (!x) return;
    closePalette();
    if (location.hash === x.href) render();
    else location.hash = x.href;
  }
  function openPalette() {
    if (pal.open) return;
    pal.open = true;
    pal.prevFocus = document.activeElement;
    $("#palette").classList.add("open");
    const inp = $("#palInput");
    inp.value = "";
    palRender();
    setTimeout(() => inp.focus(), 10);
  }
  function closePalette() {
    if (!pal.open) return;
    pal.open = false;
    $("#palette").classList.remove("open");
    if (pal.prevFocus && pal.prevFocus.focus) pal.prevFocus.focus();
  }
  SDA.openPalette = openPalette;

  /* ---------------- glossary tooltip ---------------- */
  let tipFor = null,
    tipT = 0;
  function showTip(btn) {
    const t = SDA.glossary.get(btn.dataset.term);
    if (!t) return;
    clearTimeout(tipT);
    tipFor = btn;
    const tip = $("#tip");
    tip.innerHTML = `<b>${esc(t.term)}</b>${esc(t.def)}<div style="margin-top:6px"><a href="#/glossary/${t.id}">Open in glossary →</a></div>`;
    tip.classList.add("show");
    const r = btn.getBoundingClientRect(),
      w = tip.offsetWidth,
      hh = tip.offsetHeight;
    let left = clamp(
        r.left + r.width / 2 - w / 2,
        12,
        window.innerWidth - w - 12,
      ),
      top = r.bottom + 8;
    if (top + hh > window.innerHeight - 8) top = r.top - hh - 8;
    tip.style.left = left + "px";
    tip.style.top = Math.max(8, top) + "px";
  }
  function hideTip() {
    clearTimeout(tipT);
    tipFor = null;
    const t = $("#tip");
    if (t) t.classList.remove("show");
  }
  function hideTipSoon() {
    clearTimeout(tipT);
    tipT = setTimeout(hideTip, 180);
  }

  /* ---------------- theme ---------------- */
  const SUN =
    "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z";
  const MOON = "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z";
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    Store.data.theme = t;
    Store.save();
    $("#themeIcon").setAttribute("d", t === "dark" ? SUN : MOON);
    $("#themeBtn").setAttribute(
      "aria-label",
      t === "dark" ? "Switch to light theme" : "Switch to dark theme",
    );
    document.dispatchEvent(new CustomEvent("sda:theme", { detail: t }));
  }

  /* ---------------- global listeners + boot ---------------- */
  function boot() {
    document.documentElement.classList.add("js-anim");
    if (SDA.reduced) document.documentElement.classList.add("reduced");
    applyTheme(Store.data.theme || "dark");
    document.body.dataset.depth = "simple";
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
      $("#kbdHint").textContent = "⌘ K";
    $("#themeBtn").addEventListener("click", () =>
      applyTheme(
        document.documentElement.dataset.theme === "dark" ? "light" : "dark",
      ),
    );
    $("#searchBtn").addEventListener("click", openPalette);
    $("#menuBtn").addEventListener("click", () => {
      const o = !document.body.classList.contains("nav-open");
      document.body.classList.toggle("nav-open", o);
      $("#menuBtn").setAttribute("aria-expanded", String(o));
    });
    $("#scrim").addEventListener("click", closeNav);
    $("#palette").addEventListener("click", (e) => {
      if (e.target.id === "palette") closePalette();
    });
    $("#palInput").addEventListener("input", palRender);
    $("#palInput").addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        palSel(pal.sel + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        palSel(pal.sel - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        palGo(pal.sel);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
      } else if (e.key === "Tab") {
        e.preventDefault();
      }
    });
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        pal.open ? closePalette() : openPalette();
        return;
      }
      const typing =
        /^(INPUT|TEXTAREA|SELECT)$/.test(
          (document.activeElement || {}).tagName || "",
        ) ||
        (document.activeElement && document.activeElement.isContentEditable);
      if (e.key === "/" && !typing && !pal.open) {
        e.preventDefault();
        openPalette();
      }
      if (e.key === "Escape") {
        hideTip();
        if (pal.open) closePalette();
        closeNav();
      }
      if (
        (e.key === "Enter" || e.key === " ") &&
        document.activeElement &&
        document.activeElement.classList.contains("gl-term")
      ) {
        e.preventDefault();
        const b = document.activeElement;
        if (tipFor === b && $("#tip").classList.contains("show")) hideTip();
        else showTip(b);
      }
    });
    /* copy buttons on code blocks */
    document.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-copy]");
      if (!b) return;
      const pre = b.closest(".code") && b.closest(".code").querySelector("pre");
      if (!pre) return;
      const ok = await SDA.copyText(pre.textContent);
      b.textContent = ok ? "Copied ✓" : "Failed";
      b.classList.toggle("done", ok);
      setTimeout(() => {
        b.textContent = "Copy";
        b.classList.remove("done");
      }, 1500);
    });
    /* glossary tooltips: hover, focus and tap */
    document.addEventListener("mouseover", (e) => {
      const b = e.target.closest && e.target.closest(".gl-term");
      if (b) showTip(b);
      else if (e.target.closest && e.target.closest("#tip")) clearTimeout(tipT);
    });
    document.addEventListener("mouseout", (e) => {
      if (
        e.target.closest &&
        (e.target.closest(".gl-term") || e.target.closest("#tip"))
      )
        hideTipSoon();
    });
    document.addEventListener("focusin", (e) => {
      const b = e.target.closest && e.target.closest(".gl-term");
      if (b) showTip(b);
    });
    document.addEventListener("focusout", (e) => {
      if (e.target.closest && e.target.closest(".gl-term")) hideTipSoon();
    });
    document.addEventListener("click", (e) => {
      const b = e.target.closest(".gl-term");
      if (b) {
        if (tipFor === b && $("#tip").classList.contains("show")) hideTip();
        else showTip(b);
      } else if (!e.target.closest("#tip")) hideTip();
    });
    window.addEventListener(
      "scroll",
      () => {
        if (tipFor) hideTip();
      },
      { passive: true },
    );
    /* ripple on click */
    document.addEventListener("pointerdown", (e) => {
      if (SDA.reduced) return;
      const b = e.target.closest(".btn,.icon-btn,.q-opt,.search-btn,.copy-btn");
      if (!b || b.disabled) return;
      const r = b.getBoundingClientRect(),
        s = Math.max(r.width, r.height) * 2;
      const sp = document.createElement("span");
      sp.className = "ripple";
      sp.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
      b.append(sp);
      setTimeout(() => sp.remove(), 650);
    });
    /* glow-follow cards + magnetic buttons (fine pointers only) */
    let mag = null;
    document.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType !== "mouse") return;
        const t = e.target.closest ? e.target : null;
        if (!t) return;
        const c = t.closest(".card.glow");
        if (c) {
          const r = c.getBoundingClientRect();
          c.style.setProperty("--mx", e.clientX - r.left + "px");
          c.style.setProperty("--my", e.clientY - r.top + "px");
        }
        if (SDA.reduced) return;
        const m = t.closest(".magnetic");
        if (mag && mag !== m) {
          mag.style.transform = "";
          mag = null;
        }
        if (m) {
          mag = m;
          const r = m.getBoundingClientRect();
          const dx = (e.clientX - (r.left + r.width / 2)) * 0.22,
            dy = (e.clientY - (r.top + r.height / 2)) * 0.3;
          m.style.transform = `translate(${clamp(dx, -8, 8)}px,${clamp(dy, -6, 6)}px)`;
        }
      },
      { passive: true },
    );
    document.addEventListener("sda:progress", () => {
      renderSidebar();
      updateRing();
    });
    window.addEventListener("hashchange", render);
    SDA.booted = true;
    render();
    if (SDA.errors.length)
      setTimeout(
        () =>
          SDA.toast(
            `⚠ ${SDA.errors.length} content block(s) failed to load — see console`,
            4000,
          ),
        600,
      );
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else setTimeout(boot, 0);
})();
