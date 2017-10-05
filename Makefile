PAGES:=$(shell find pages -name "*.html")

ROOT:=$(shell if [ -d node_modules/prosemirror-model ]; then echo node_modules/; else echo ../node_modules/; fi)

all: $(PAGES:pages/%=public/%) \
     public/js/fullpage.js \
     public/js/startpage.js \
     public/css/editor.css

public/%.html: pages/%.* templates/* src/build/*.js
	mkdir -p $(dir $@)
	node lib/build.js $<

public/js/fullpage.js: src/collab/client/*.js
	$(ROOT).bin/rollup -c

public/js/startpage.js: src/collab/client/*.js
	$(ROOT).bin/rollup -c

public/css/editor.css: $(ROOT)prosemirror-view/style/prosemirror.css \
                       $(ROOT)prosemirror-menu/style/menu.css \
                       $(ROOT)prosemirror-example-setup/style/style.css \
                       public/css/editor-base.css
	cat $^ > $@

clean:
	rm public/*.html public/js/fullpage.js public/js/startpage.js public/css/editor.css
