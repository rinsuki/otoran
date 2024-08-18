process.env.TZ = "Asia/Tokyo"
import Koa from "koa"
import Router from "@koa/router"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import got from "got"
import { format } from "date-fns"
import $ from "transform-ts"
import fs from "fs"

const app = new Koa()
const router = new Router()

const oneday = 24 * 60 * 60 * 1000

const Footer: React.FC<{}> = props => {
    return <>
        <hr />
        <footer>
            <div>Data from: <a href="https://site.nicovideo.jp/search-api-docs/snapshot">ニコニコ動画 『スナップショット検索API v2』</a></div>
            <div>GitHub: <a href="https://github.com/rinsuki/otoran">https://github.com/rinsuki/otoran</a></div>
            <div>Author: <a href="https://rinsuki.net">rinsuki</a></div>
            {props.children}
            <div>NEW! otoran 内で動画視聴/いいねができる <a href="https://addons.mozilla.org/ja/firefox/addon/otoran-inline-player/">Firefoxアドオン</a>を公開しました (2021/11/07)</div>
            <div><a href="/">トップに行く</a></div>
        </footer>
    </>
}

router.get("/", async ctx => {
    const currentTimestamp = await got("https://snapshot.search.nicovideo.jp/api/v2/snapshot/version", {responseType: "json"}).then(r => r.body) as any
    const latestDay = new Date(currentTimestamp.last_modified).getTime() - oneday
    const latestPath = format(latestDay, "yyyy/MM/dd")
    ctx.body = renderToStaticMarkup(<html lang="ja">
        <head>
            <meta charSet="UTF-8"/>
            <title>otoran</title>
            <meta name="twitter:card" content="summary" />
            <meta property="og:title" content="otoran" />
            <meta property="og:description" content="ニコニコ動画のスナップショット検索APIを利用して、特定のタグ (現在は音MAD/VOCALOIDのみ) に投稿された動画一覧を投稿日ごとに分けて見ることができるサービスです。"/>
        </head>
        <body>
            <h1>otoran</h1>
            <p>ニコニコ動画の<a href="https://site.nicovideo.jp/search-api-docs/snapshot">スナップショット検索API</a>を利用して、特定のタグ<small>(現在は音MAD/VOCALOIDのみ)</small>に投稿された動画一覧を投稿日ごとに分けて見ることができます。</p>
            <p>スナップショット検索APIの仕様 (毎日日本時間の早朝にスナップショットを取り、その時の状態を検索する) 上、当日の日付での表示内容は不完全になるほか、各種数値等もその時のものになります。</p>
            <ul>
                <li><a href={`/daily/otomad/${latestPath}`}>{format(latestDay, "yyyy年M月d日")} (たぶん昨日) に投稿された音MAD</a></li>
                <li><a href={`/daily/vocaloid/${latestPath}`}>{format(latestDay, "yyyy年M月d日")} (たぶん昨日) に投稿されたVOCALOID・派生(〜ってみた動画など)含む動画</a></li>
                <li><a href={`/daily/vocaloid_only/${latestPath}`}>{format(latestDay, "yyyy年M月d日")} (たぶん昨日) に投稿されたVOCALOID動画</a> (頑張ってフィルタしていますがすりぬけることもあります)</li>
                <li><a href={`/daily/all/${latestPath}`}>{format(latestDay, "yyyy年M月d日")} (たぶん昨日) に投稿された全ての動画</a></li>
            </ul>
            <Footer />
        </body>
    </html>)
    ctx.set("Cache-Control", "s-maxage=600")
})

function calcMajorTags(tags: string[]) {
    const tagCount = new Map<string, number>()
    for (const tag of tags) {
        if (tagCount.has(tag)) {
            tagCount.set(tag, tagCount.get(tag)!+1)
        } else {
            tagCount.set(tag, 1)
        }
    }
    return Array.from(tagCount.entries()).sort((b, a) => a[1]-b[1])
}

function normalizedTag(tag: string) {
    return encodeURIComponent(tag.toLowerCase().normalize("NFKC"))
}

function majorTagsNormalize(counts: [string, number][]) {
    const map = new Map<string, [string, number][]>()
    for (const count of counts) {
        const normalizedKey = normalizedTag(count[0])
        map.set(normalizedKey, [...map.get(normalizedKey) ?? [], count])
    }
    const arr = [] as [string, number][]
    for (const [_, entries] of map.entries()) {
        if (entries.length === 1) {
            arr.push(entries[0])
        } else {
            const entry = entries.sort((b, a) => a[1]-b[1])[0]
            entry[1] = entries.reduce((prev, now) => prev + now[1], 0)
            arr.push(entry)
        }
    }
    return arr
}

const words = new Map([
    ["otomad", {
        query: {
            q: "音MAD",
        },
        displayName: "音MAD",
    }],
    ["vocaloid", {
        query: {
            q: "VOCALOID",
        },
        displayName: "VOCALOID＆派生(MMD・〜ってみた等)"
    }],
    ["vocaloid_only", {
        query: {
            q: "VOCALOID -歌ってみた -踊ってみた -MMD -ニコカラ",
        },
        displayName: "VOCALOID"
    }],
    ["sound", {
        query: {
            q: "音楽・サウンド",
            targets: "genre",
        },
        displayName: "音楽・サウンドジャンル",
    }],
    ["all", {
        query: {
            q: "",
        },
        displayName: "全ての動画",
    }],
])


try {
    // vercelの場合ここはvercelにやってもらう
    const STATIC_DIR = __dirname+"/../static"
    const allowedFiles = fs.readdirSync(STATIC_DIR)

    if (allowedFiles.length) router.get("/static/:filename", async (ctx, next) => {
        const filename = $.string.transformOrThrow(ctx.params.filename)
        if (!allowedFiles.includes(filename)) return next()
        const ext = filename.split(".")
        ctx.type = ({
            "js": "application/javascript",
            "css": "text/css",
        } as {[key: string]: string})[ext.slice(-1)[0]] ?? "application/octet-stream"
        ctx.body = fs.createReadStream(STATIC_DIR + "/" + filename)
    })
} catch(e) {
}

router.get("/daily/:word/:year/:month/:day", async (ctx, next) => {
    const {year, month, day, word} = ctx.params
    const tag = words.get(word)
    if (tag == null) return next()
    const d = new Date(year, month-1, day)
    const path = `/daily/${word}/${format(d, "yyyy/MM/dd")}`
    if (path !== ctx.path) {
        ctx.redirect(path)
        return
    }
    const target = new URL("https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search")
    target.searchParams.set("targets", "tagsExact")
    for (const [key, value] of Object.entries(tag.query)) {
        target.searchParams.set(key, value)
    }
    const useLikeAsAPISort = (new Date(2020, 7-1, 27)).getTime() <= d.getTime()
    target.searchParams.set("_sort", useLikeAsAPISort ? "-likeCounter" : "-mylistCounter")
    target.searchParams.set("fields", [
        "contentId",
        "title",
        "viewCounter",
        "mylistCounter",
        "commentCounter",
        "tags",
        "genre",
        "thumbnailUrl",
        "likeCounter",
        "userId",
        "channelId",
    ].join(","))
    target.searchParams.set("filters[startTime][gte]", d.toISOString())
    target.searchParams.set("filters[startTime][lt]", new Date(d.getTime() + oneday).toISOString())
    target.searchParams.set("_limit", "100")
    console.log(target.href)
    const res = $.obj({
        meta: $.obj({
            totalCount: $.number,
        }),
        data: $.array($.obj({
            contentId: $.string,
            title: $.string,
            thumbnailUrl: $.string,
            tags: $.string,
            mylistCounter: $.number,
            commentCounter: $.number,
            viewCounter: $.number,
            likeCounter: $.number,
            genre: $.nullable($.string),
            userId: $.nullable($.number),
            channelId: $.nullable($.number),
        }))
    }).transformOrThrow(await got(target.href, {
        responseType: "json",
        headers: {
            "User-Agent": "otoran/1.0.0 (+https://github.com/rinsuki/otoran)",
        }
    }).then(r => r.body))
    const videos = res.data.sort((b, a) => {
        const mylistAndLike = (a.mylistCounter + a.likeCounter) - (b.mylistCounter + b.likeCounter)
        if (mylistAndLike !== 0) return mylistAndLike
        const comment = a.commentCounter - b.commentCounter
        if (comment !== 0) return comment
        return a.viewCounter - b.viewCounter
    })
    const majorTags = majorTagsNormalize(calcMajorTags(videos.map(video => video.tags.split(" ").filter(tag => tag.length)).flat())).filter(([_, cnt]) => cnt > 1)
    ctx.body = renderToStaticMarkup(<html lang="ja">
        <head>
            <meta charSet="UTF-8" />
            <link rel="stylesheet" href="/static/style.css" />
            <script src="/static/tagfilter.js" defer/>
            <title>{format(d, "yyyy年M月d日")}に投稿された{tag.displayName} - otoran</title>
            <meta name="twitter:card" content="summary" />
            <meta property="og:title" content={`${format(d, "yyyy年M月d日")}に投稿された${tag.displayName} - otoran`} />
            <meta property="og:description" content={`${format(d, "yyyy年M月d日")}に投稿された${tag.displayName} (${res.meta.totalCount}件のうち${videos.length}件を表示中) をotoranでチェック！`}/>
        </head>
        <body>
            <div id="app">
                <a href={`/daily/${word}/${format(d.getTime() - oneday, "yyyy/MM/dd")}`} id="prev" className="prevnext"><span><span className="link">前の日</span><br /><kbd>A</kbd></span></a>
                <main>
                    <h1>{format(d, "yyyy年M月d日")}に投稿された{tag.displayName}</h1>
                    <p>全 <strong>{res.meta.totalCount}</strong> 件のうち <strong>{videos.length}</strong> 件を表示しています (表示はいいね+マイリス数(同数の場合はコメント数)順、取得は{useLikeAsAPISort ? "いいね" : "マイリスト"}数順)</p>
                    <div id="tags-filter" className="hidden">
                        絞り込み: {majorTags.map(([tag, count]) => <label key={tag}><input type="checkbox" value={normalizedTag(tag)}/>{tag}<small>({count})</small></label>)}
                    </div>
                    {videos.map(v => <div key={v.contentId} className="video" data-normalized-tags={` ${v.tags.split(" ").map(normalizedTag).join(" ")} `} data-user-id={v.userId} data-channel-id={v.channelId}>
                        <a className="thumbnail" href={`https://www.nicovideo.jp/watch/${v.contentId}`}><img src={v.thumbnailUrl} loading="lazy" width="130" height="100"/></a>
                        <div className="video-detail">
                            <div className="title"><a href={`https://www.nicovideo.jp/watch/${v.contentId}`} className="title">{v.title}</a></div>
                            <div className="stats"><span className="play-count">再生: <strong>{v.viewCounter}</strong></span> / <span className="comment-count">コメント: <strong>{v.commentCounter}</strong></span> / <span className="mylist-count">マイリスト: <strong>{v.mylistCounter}</strong></span> / <span className="like-count">いいね: <strong>{v.likeCounter}</strong></span></div>
                            <div className="tags">
                                {v.genre && <span className="tag-genre">ジャンル: {v.genre}{" "}</span>}
                                {v.tags.split(" ").filter(t => t.length).map((tag: string) => <span key={tag}>🏷<a href={`https://www.nicovideo.jp/tag/${encodeURIComponent(tag)}`}>{tag}</a>{" "}</span>)}
                            </div>
                        </div>
                    </div>)}
                </main>
                <a href={`/daily/${word}/${format(d.getTime() + oneday, "yyyy/MM/dd")}`} id="next" className="prevnext"><span><span className="link">次の日</span><br /><kbd>D</kbd></span></a>
            </div>
            <Footer>
                <div>ヒント: A/Dキーですばやく前/次の日に移動できます</div>
            </Footer>
        </body>
    </html>)
    ctx.set("Cache-Control", "s-maxage=600") // 10分くらいCDNキャッシュしとく
})

app.use(router.routes())
app.listen(process.env.PORT || 3000)
