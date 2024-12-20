const { addonBuilder, serveHTTP, publishToCentral }  = require('stremio-addon-sdk')
var needle = require('needle')

const builder = new addonBuilder({
    id: 'de.workinprogress',
    version: '1.0.0',

    name: 'Work in Progress',

    // Properties that determine when Stremio picks this addon
    // this means your addon will be used for streams of the type movie
    catalogs: [],
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    behaviorHints: {
        configurable: true,
        configurationRequired: true
    },
    config: [
        {
            title: 'Username',
            key: 'username',
            type: 'text',
            required: true
        },
        {
            title: 'Password',
            key: 'password',
            type: 'password',
            required: true
        },
        {
            title: 'TMDB API Access Token',
            key: 'tmdb',
            type: 'text',
            required: true
        }
    ]
})

function scrapeEasynews() {

}

// takes function(args)
builder.defineStreamHandler(function(args) {

    const idSplit = args.id.split(':')

    return needle('get', `https://api.themoviedb.org/3/find/${idSplit[0]}?external_source=imdb_id&language=de`, { headers: { 'Authorization': `Bearer ${args.config.tmdb}` }})
        .then(async resp => {
            const queries = [];

            if (resp.body.tv_results.length > 0) {
                const season = idSplit[1].padStart(2, '0');
                const episode = idSplit[2].padStart(2, '0');

                const result = resp.body.tv_results[0];
                if (result.name !== result.original_name) {
                    queries.push(`${result.name} S${season} E${episode}`);
                    queries.push(`${result.original_name} German S${season} E${episode}`);
                    queries.push(`${result.original_name} Deutsch S${season} E${episode}`);
                } else {
                    queries.push(`${result.name} German S${season} E${episode}`);
                    queries.push(`${result.name} Deutsch S${season} E${episode}`);
                }
            }

            if (resp.body.movie_results.length > 0) {
                const result = resp.body.movie_results[0];
                console.log(result);
                if (result.name !== result.original_title) {
                    queries.push(`${result.title} ${result.release_date.substring(0, 4)}`);
                    queries.push(`${result.original_title} German ${result.release_date.substring(0, 4)}`);
                    queries.push(`${result.original_title} Deutsch ${result.release_date.substring(0, 4)}`);
                    queries.push(`${result.title}`);
                    queries.push(`${result.original_title} German`);
                    queries.push(`${result.original_title} Deutsch`);
                } else {
                    queries.push(`${result.title} German ${result.release_date.substring(0, 4)}`);
                    queries.push(`${result.title} Deutsch ${result.release_date.substring(0, 4)}`);
                    queries.push(`${result.title} German`);
                    queries.push(`${result.title} Deutsch`);
                }
            }

            const streams = [];

            const auth = btoa(`${args.config.username}:${args.config.password}`)

            for (let query of queries) {
                if (streams.length >= 10) {
                    break;
                }

                console.log(query);

                const params = {
                    gps: query,
                    s1: 'relevance',
                    s1d: '-',
                    s2: 'dbps',
                    s2d: '-',
                    s3: 'dsize',
                    s3d: '+',
                    'fty[]': 'VIDEO',
                    pno: 1
                }
                const resp = await needle('get', 'https://members.easynews.com/2.0/search/solr-search?', params, { headers: { 'Authorization': `Basic ${auth}` } })
                for (let entry of JSON.parse(resp.body).data) {
                    if (entry.virus) {
                        continue;
                    }

                    let items = {
                        url: `https://members.easynews.com/dl/auto/443/${entry.hash}${entry.id}${entry.extension}/${encodeURIComponent(entry.fn)}${entry.extension}`,
                        description: `${entry.fn}`,
                        name: `${entry.fullres} - ${Math.floor(entry.runtime / 60)}m:${entry.runtime % 60}s`,
                        behaviorHints: {
                            notWebReady: true,
                            proxyHeaders: {
                                request: {
                                    "Authorization": `Basic ${auth}`
                                }
                            },
                            videoHash: entry.hash,
                            videoSize: entry.size,
                            filename: entry.fn + entry.extension
                        }
                    };

                    streams.push(items);
                }
            }

            console.log(streams);
            return { streams };
        })
})

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 })
//publishToCentral("https://your-domain/manifest.json") // <- invoke this if you want to publish your addon and it's accessible publically on "your-domain"

