PAGES:=$(shell find pages -name "*.html")

ROOT:=$(shell if [ -d node_modules/prosemirror-model ]; then echo node_modules/; else echo ../node_modules/; fi)

all: $(PAGES:pages/%=public/%) \
     public/js/script.js \
     public/js/prosemirror.js \
     public/css/editor.css

public/%.html: pages/%.* templates/* src/build/*.js
	mkdir -p $(dir $@)
	node src/build/build.js $<

CORE:=prosemirror-model prosemirror-transform prosemirror-state prosemirror-view \
      prosemirror-keymap prosemirror-inputrules prosemirror-history prosemirror-commands \
      prosemirror-schema-basic prosemirror-schema-list \
      prosemirror-dropcursor prosemirror-menu prosemirror-example-setup

public/js/prosemirror.js: bin/library.js $(foreach LIB,$(CORE),$(wildcard $(ROOT)$(LIB)/dist/*.js))
	mkdir -p $(dir $@)
	node bin/build-library.js > $@

public/js/script.js: pages/script.js
	mkdir -p $(dir $@)
	node bin/build-example.js $< > $@

public/css/editor.css: $(ROOT)prosemirror-view/style/prosemirror.css \
                       $(ROOT)prosemirror-menu/style/menu.css \
                       $(ROOT)prosemirror-gapcursor/style/gapcursor.css \
                       $(ROOT)prosemirror-example-setup/style/style.css \
                       public/css/editor-base.css
	cat $^ > $@

clean:
	rm public/*.html public/js/script.js public/js/prosemirror.js public/css/editor.css
