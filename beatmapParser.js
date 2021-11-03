async function beatmapParser(file) {
    var zip = new JSZip()
    var contents = await zip.loadAsync(file)
    var files = []
    var gameModes = []
    var beatmapData = {}
    for (var k in contents.files) {
        files.push({name: k, read: function(name, contents) {
            return function() {
                return contents.file(name).async("arrayBuffer")
            }
        }(k, contents)})
    }
    function readfile(name) {
        return contents.file(name).async("arrayBuffer")
    }
    var start, end
    for (var i=0; i<files.length; i++) {
        if (files[i].name.endsWith('.osu')) {
            gameModes.push(files[i].name.split('[').pop().split(']')[0])
            if (! end || ! start) {
                var t = files[i].name.split(files[i].name.split('[').pop().split(']')[0])
                var start = t[0]
                var end = t[1]
            }
        }
    }
    async function selectedMode(gameMode) {
        var data = await contents.file(start + gameMode + end).async("string")
        var data = data.split('\r').join('').split('\n')
        var newData = []
        for (var i=0; i<data.length; i++) {
            if (! data[i].startsWith('//')) {
                newData.push(data[i])
            }
        }
        var data = newData.join('\n')
        beatmapData.version = data.split('\n')[0].split('v').pop()
        var sections = ['[General]', '[Editor]', '[Metadata]', '[Difficulty]']
        for (var u=0; u<sections.length; u++) {
            if (data.split(sections[u]+'\n').length != 1) {
                var r = data.split(sections[u]+'\n').pop().split('\n\n')[0].split('\n')
                beatmapData[sections[u]] = {}
                for (var i=0; i<r.length; i++) {
                    var o = r[i].split(':')
                    o[1] = o[1].trim()
                    var q = o[1].split('')
                    var isNumber = true
                    for (var p=0; p<q.length; p++) {
                        if (! '1234567890.'.split('').includes(q[p])) {
                            var isNumber = false
                        }
                    }
                    if (isNumber) {
                        o[1] = parseInt(o[1])
                    }
                    if (o[0] == 'AudioFilename') {
                        var mime = o[1].split('.').pop()
                        if (mime == 'mp3' || mime == 'mp2') {
                            var mime = 'mpeg'
                        }
                        beatmapData[sections[u]].Audio = URL.createObjectURL(new Blob([await readfile(o[1])], {type: 'audio/'+mime}))
                    }
                    beatmapData[sections[u]][o[0]] = o[1]
                }
            }
        }
        if (data.split('[Events]\n').length != 1) {
            var lines = data.split('[Events]\n').pop().split('\n\n')[0].split('\n')
            beatmapData['[Events]'] = {}
            for (var i=0; i<lines.length; i++) { // based on opsu beatmap parser
                var tokens = lines[i].split(",") 
                if (tokens[0] == '0') { // background image
                    tokens[2] = tokens[2].split('"').join('')
                    var mime = tokens[2].split('.').pop()
                    if (mime == 'jpg') {
                        var mime = 'jpeg'
                    }
                    tokens[2] = URL.createObjectURL(new Blob([await readfile(tokens[2])], {type: 'image/'+mime}))
                    beatmapData['[Events]'].image = tokens[2]
                } else if (tokens[0] == '1' || tokens[0].toLowerCase() == 'video') { // background video
                    tokens[2] = tokens[2].split('"').join('')
                    if (['flv'].includes(tokens[2].split('.').pop())) { // unsupported video formats
                        continue
                    }
                    tokens[2] = URL.createObjectURL(new Blob([await readfile(tokens[2])], {type: 'video/'+tokens[2].split('.').pop()}))
                    beatmapData['[Events]'].video = tokens[2]
                } else if (tokens[0] == '2') { // break periods
                    beatmapData['[Events]'].breaks = []
                    beatmapData['[Events]'].breaks.push({start: parseInt(tokens[1]), end: parseInt(tokens[2])})
                } else {
                    console.warn('Event type not implimented: '+tokens[0])
                }
            }
        }
        if (data.split('[TimingPoints]\n').length != 1) {
            var lines = data.split('[TimingPoints]\n').pop().split('\n\n')[0].split('\n')
            beatmapData['[TimingPoints]'] = []
            for (var i=0; i<lines.length; i++) {
                var tokens = lines[i].split(",")
                beatmapData['[TimingPoints]'].push({
                    time: parseInt(tokens[0]), 
                    beatLength: parseInt(tokens[1]),
                    meter: parseInt(tokens[2]),
                    sampleSet: parseInt(tokens[3]),
                    sampleIndex: parseInt(tokens[4]),
                    volume: parseInt(tokens[5]),
                    uninherited: parseInt(tokens[6]),
                    effects: parseInt(tokens[7])
                })
            }
        }
        /* // not implimented
        if (data.split('[Colours]\n').length != 1) {
            var lines = data.split('[Colours]\n').pop().split('\n\n')[0].split('\n')
            beatmapData['[Colours]'] = {}
            for (var i=0; i<lines.length; i++) {


            }
        }
        */
        function parseObjectParams(line, type) {
            var tokens = line.split(',').slice(5)
            if (tokens.length == 0) {
                return null
            }
            var p = {}
            if (type == 0) {
                p = null
            } else if (type == 1 || type == 2 || type == 6) {
                p.curveType = tokens[0].split('|')[0]
                p.curvePoints = []
                var a = tokens[0].split('|').slice(1).join('|')
                if (a.trim() != '') {
                    a = a.split('|')
                    for (var i=0; i<a.length; i++) {
                        var o = a[i].split(':')
                        p.curvePoints.push({x: o[0], y: o[1]})
                    }
                }
                p.slides = parseInt(tokens[1])
                p.Length = parseInt(tokens[2])
                p.edgeSounds = tokens[3]
                p.edgeSets = tokens[4]
                p.hitSample = tokens[5]
            } else if (type == 3 || type == 12) {
                p = line.split(",")[5]
            } else {
                p = null // unsupported feature
            }
            return p
        }
        if (data.split('[HitObjects]\n').length != 1) {
            var lines = data.split('[HitObjects]\n').pop().split('\n')
            beatmapData['[HitObjects]'] = []
            for (var i=0; i<lines.length; i++) {
                if (lines[i].trim() == '') {
                    continue
                }
                // x,y,time,type,hitSound,objectParams,hitSample
                var tokens = lines[i].split(",")
                beatmapData['[HitObjects]'].push({
                    x: parseInt(tokens[0]), 
                    y: parseInt(tokens[1]),
                    time: parseInt(tokens[2]),
                    type: parseInt(tokens[3]),
                    hitSound: parseInt(tokens[4]),
                    objectParams: parseObjectParams(lines[i], tokens[3]),
                    hitSample: tokens[tokens.length]
                })
            }
        }
        return beatmapData
    }
    return {c: selectedMode, modes: gameModes}
}
