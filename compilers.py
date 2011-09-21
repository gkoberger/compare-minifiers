JS_COMPILERS = [("YUI", ["java", "-jar", "./libs/yuicompressor-2.4.4.jar"]),
                ("Uglify", ["uglifyjs", "--unsafe"])]

CSS_COMPILERS = [("YUI", ["java", "-jar", "./libs/yuicompressor-2.4.4.jar"]),
                 ("clean-css", ["cleancss"]),
                 ("LESS", ["lessc", "-x"])]
